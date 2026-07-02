// Typed wrappers around the Compaki marketplace Soroban contract.
// Build → simulate → sign (server-held keys) → submit → poll, with one retry
// on timeout. Nothing outside src/lib/stellar may talk to the chain.

import {
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

import { stellarConfig } from "./config";
import { sleep, withTimeoutRetry } from "./retry";

export interface MarketplaceConfigOnChain {
  operator: string;
  communityFund: string;
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
}

let rpcServer: rpc.Server | undefined;

function getRpc(): rpc.Server {
  rpcServer ??= new rpc.Server(stellarConfig.rpcUrl);
  return rpcServer;
}

/** Freshly-funded accounts can lag on the load-balanced RPC; poll briefly. */
async function getAccountWithWait(server: rpc.Server, publicKey: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await server.getAccount(publicKey);
    } catch (error) {
      lastError = error;
      await sleep(2_000);
    }
  }
  throw lastError;
}

function scAddress(publicKeyOrContract: string): xdr.ScVal {
  return nativeToScVal(publicKeyOrContract, { type: "address" });
}

function scU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

function scU64(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "u64" });
}

function scI128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

interface InvokeResult {
  txHash: string;
  returnValue: xdr.ScVal | undefined;
}

/**
 * Builds, simulates, signs and submits one contract invocation, then polls
 * until it is confirmed. The signer's account is the transaction source, so
 * its signature also covers `require_auth` for that address (including the
 * token sub-transfers in `purchase`).
 */
async function invokeContract(
  method: string,
  args: xdr.ScVal[],
  signer: Keypair,
): Promise<InvokeResult> {
  return withTimeoutRetry(`invoke ${method}`, async () => {
    const server = getRpc();
    const account = await getAccountWithWait(server, signer.publicKey());
    const contract = new Contract(stellarConfig.marketplaceContractId);

    const tx = new TransactionBuilder(account, {
      fee: (Number(BASE_FEE) * 1_000).toString(), // generous cap; actual fee comes from simulation
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(60)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(signer);

    const sent = await server.sendTransaction(prepared);
    if (sent.status === "ERROR") {
      throw new Error(
        `Transaction submission failed for ${method}: ${JSON.stringify(sent.errorResult ?? sent.status)}`,
      );
    }

    // Poll for confirmation (testnet closes ledgers ~every 5s).
    for (let attempt = 0; attempt < 20; attempt++) {
      const result = await server.getTransaction(sent.hash);
      if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return { txHash: sent.hash, returnValue: result.returnValue };
      }
      if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(
          `Transaction ${sent.hash} failed on-chain (${method}): ${result.resultXdr?.toXDR("base64") ?? "no result"}`,
        );
      }
      await sleep(1_500);
    }
    throw new Error(`Transaction ${sent.hash} timed out waiting for confirmation (${method})`);
  });
}

/** Registers a marketplace instance on-chain. Returns its on-chain id. */
export async function createMarketplace(params: {
  operatorSecret: string;
  communityFundPublicKey: string;
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
}): Promise<{ marketplaceId: bigint; txHash: string }> {
  const operator = Keypair.fromSecret(params.operatorSecret);
  const { txHash, returnValue } = await invokeContract(
    "create_marketplace",
    [
      scAddress(operator.publicKey()),
      scAddress(params.communityFundPublicKey),
      scU32(params.vendorBps),
      scU32(params.operatorBps),
      scU32(params.communityBps),
    ],
    operator,
  );
  if (!returnValue) {
    throw new Error("create_marketplace returned no value");
  }
  return { marketplaceId: scValToNative(returnValue) as bigint, txHash };
}

/** Registers a vendor; must be signed by the marketplace's operator. */
export async function registerVendor(params: {
  operatorSecret: string;
  marketplaceId: bigint;
  vendorPublicKey: string;
}): Promise<{ txHash: string }> {
  const operator = Keypair.fromSecret(params.operatorSecret);
  const { txHash } = await invokeContract(
    "register_vendor",
    [scU64(params.marketplaceId), scAddress(params.vendorPublicKey)],
    operator,
  );
  return { txHash };
}

/**
 * Executes an atomic split purchase, signed by the buyer's custodial key.
 * `amountStroops` is the token amount with 7 decimals (see usdToStroops).
 */
export async function purchase(params: {
  buyerSecret: string;
  marketplaceId: bigint;
  vendorPublicKey: string;
  amountStroops: bigint;
}): Promise<{ txHash: string }> {
  const buyer = Keypair.fromSecret(params.buyerSecret);
  const { txHash } = await invokeContract(
    "purchase",
    [
      scU64(params.marketplaceId),
      scAddress(buyer.publicKey()),
      scAddress(params.vendorPublicKey),
      scI128(params.amountStroops),
    ],
    buyer,
  );
  return { txHash };
}

/** Read-only config lookup via simulation (no transaction submitted). */
export async function getMarketplace(
  marketplaceId: bigint,
): Promise<MarketplaceConfigOnChain> {
  return withTimeoutRetry("simulate get_marketplace", async () => {
    const server = getRpc();
    // Any funded account works as a simulation source; the issuer always exists.
    const account = await server.getAccount(stellarConfig.usdcIssuerPublic);
    const contract = new Contract(stellarConfig.marketplaceContractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(contract.call("get_marketplace", scU64(marketplaceId)))
      .setTimeout(60)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      throw new Error(
        `get_marketplace(${marketplaceId}) simulation failed: ${
          rpc.Api.isSimulationError(sim) ? sim.error : "no result"
        }`,
      );
    }
    const raw = scValToNative(sim.result.retval) as {
      operator: string;
      community_fund: string;
      vendor_bps: number;
      operator_bps: number;
      community_bps: number;
    };
    return {
      operator: raw.operator,
      communityFund: raw.community_fund,
      vendorBps: raw.vendor_bps,
      operatorBps: raw.operator_bps,
      communityBps: raw.community_bps,
    };
  });
}
