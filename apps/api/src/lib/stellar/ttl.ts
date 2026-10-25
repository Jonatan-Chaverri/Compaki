// Keeps the marketplace contract's code and instance from expiring.
//
// Soroban charges rent to keep ledger entries alive. The contract's code is
// tens of KB, so extending it is expensive (on testnet in October 2026, about
// 170 XLM per day of extension for ~57 KB). The contract never extends its
// own code in user calls, so that cost can't land on a buyer's purchase;
// instead Compaki pays it here, from the demo-asset issuer account, through
// the API scheduler. When the network's resource fee exceeds a transaction's
// own uint32 fee field (~429 XLM), the extension is wrapped in a fee bump.
// The extension needs no authorization, so on testnet a fresh Friendbot
// account pays it (free test XLM) instead of draining the issuer.

import {
  Address,
  Keypair,
  Operation,
  SorobanDataBuilder,
  Transaction,
  TransactionBuilder,
  rpc,
  xdr,
  type FeeBumpTransaction,
} from "@stellar/stellar-sdk";

import { fundWithFriendbot } from "./accounts";
import { isTestnet, stellarConfig } from "./config";
import { sleep } from "./retry";

const LEDGERS_PER_DAY = 17_280;
const UINT32_MAX = 4_294_967_295;
const BASE_FEE = "100";

function server(): rpc.Server {
  return new rpc.Server(stellarConfig.rpcUrl);
}

function instanceKey(contractId: string): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
}

export interface ContractTtl {
  /** Days left before the code / the instance expire. */
  codeDays: number;
  instanceDays: number;
  codeKey: xdr.LedgerKey;
  instanceKey: xdr.LedgerKey;
}

export async function getContractTtl(contractId = stellarConfig.marketplaceContractId): Promise<ContractTtl> {
  const rpcServer = server();
  const latest = (await rpcServer.getLatestLedger()).sequence;
  const key = instanceKey(contractId);
  const [instance] = (await rpcServer.getLedgerEntries(key)).entries;
  if (!instance) throw new Error(`Contract ${contractId} not found (or archived)`);
  const hash = instance.val.contractData().val().instance().executable().wasmHash();
  const codeKey = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash }));
  const [code] = (await rpcServer.getLedgerEntries(codeKey)).entries;
  const days = (liveUntil: number | undefined) => ((liveUntil ?? latest) - latest) / LEDGERS_PER_DAY;
  return {
    codeDays: code ? days(code.liveUntilLedgerSeq) : 0,
    instanceDays: days(instance.liveUntilLedgerSeq),
    codeKey,
    instanceKey: key,
  };
}

/**
 * Extends the contract's code and instance to `targetDays` when either has
 * fewer than `minDays` left. Returns the tx hash, or null when nothing was
 * needed. The signer pays the rent (testnet: a fresh Friendbot account;
 * otherwise the issuer).
 */
export async function keepContractAlive(options: {
  minDays?: number;
  targetDays?: number;
  signerSecret?: string;
  contractId?: string;
} = {}): Promise<{ txHash: string; feeXlm: number } | null> {
  const minDays = options.minDays ?? 10;
  const targetDays = options.targetDays ?? 30;
  const ttl = await getContractTtl(options.contractId);
  if (ttl.codeDays >= minDays && ttl.instanceDays >= minDays) return null;

  let signer: Keypair;
  if (options.signerSecret) {
    signer = Keypair.fromSecret(options.signerSecret);
  } else if (isTestnet()) {
    signer = Keypair.random();
    await fundWithFriendbot(signer.publicKey());
  } else {
    signer = Keypair.fromSecret(stellarConfig.usdcIssuerSecret);
  }
  const rpcServer = server();
  let account;
  for (let i = 0; ; i++) {
    try {
      account = await rpcServer.getAccount(signer.publicKey());
      break;
    } catch (error) {
      if (i >= 10) throw error;
      await sleep(1_500); // a just-funded account may not be visible to RPC yet
    }
  }
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: stellarConfig.networkPassphrase })
    .addOperation(Operation.extendFootprintTtl({ extendTo: targetDays * LEDGERS_PER_DAY }))
    .setSorobanData(new SorobanDataBuilder().setReadOnly([ttl.codeKey, ttl.instanceKey]).build())
    .setTimeout(120)
    .build();
  const sim = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`TTL extension simulation failed: ${sim.error}`);
  const signed = signWithFeeBumpIfNeeded(tx, sim, signer);
  const sent = await rpcServer.sendTransaction(signed);
  if (sent.status === "ERROR") throw new Error(`TTL extension rejected: ${JSON.stringify(sent.errorResult)}`);
  for (let i = 0; i < 30; i++) {
    const result = await rpcServer.getTransaction(sent.hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { txHash: sent.hash, feeXlm: Number(sim.minResourceFee) / 1e7 };
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error(`TTL extension ${sent.hash} failed`);
    await sleep(1_500);
  }
  throw new Error(`TTL extension ${sent.hash} confirmation timeout`);
}

/** Assembles and signs; wraps in a fee bump when the resource fee exceeds uint32. */
function signWithFeeBumpIfNeeded(
  tx: Transaction,
  sim: rpc.Api.SimulateTransactionSuccessResponse | rpc.Api.SimulateTransactionRestoreResponse,
  signer: Keypair,
): Transaction | FeeBumpTransaction {
  if (BigInt(tx.fee) + BigInt(sim.minResourceFee) <= UINT32_MAX) {
    const prepared = rpc.assembleTransaction(tx, sim).build();
    prepared.sign(signer);
    return prepared;
  }
  const sorobanData = sim.transactionData.build();
  const envelope = rpc
    .assembleTransaction(tx, sim)
    .setSorobanData(new SorobanDataBuilder(sorobanData).setResourceFee(0).build())
    .build()
    .toEnvelope();
  envelope.v1().tx().ext(new xdr.TransactionExt(1, sorobanData));
  const inner = new Transaction(envelope, stellarConfig.networkPassphrase);
  inner.sign(signer);
  const bump = TransactionBuilder.buildFeeBumpTransaction(signer, BASE_FEE, inner, stellarConfig.networkPassphrase);
  bump.sign(signer);
  return bump;
}
