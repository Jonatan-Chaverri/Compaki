// Typed wrappers around the Compaki marketplace Soroban contract.
// Build → simulate → sign (server-held keys) → submit → poll, with one retry
// on timeout. Nothing outside src/lib/stellar may talk to the chain.

import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
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

/** Contract error codes (contracts/marketplace/src/lib.rs `Error`). */
export const CONTRACT_ERRORS: Record<number, string> = {
  1: "AlreadyInitialized",
  2: "NotInitialized",
  3: "InvalidSplit",
  4: "MarketplaceNotFound",
  5: "VendorNotRegistered",
  6: "InvalidAmount",
  7: "RewardsNotEnabled",
  8: "InvalidBeneficiaries",
  9: "NoActivePeriod",
  10: "PeriodNotFound",
  11: "PeriodNotEnded",
  12: "PeriodAlreadyClosed",
  13: "PeriodNotClosed",
  14: "NotBeneficiary",
  15: "AlreadyClaimed",
  16: "NothingToClaim",
  17: "PeriodActive",
  18: "InvalidPeriodEnd",
  19: "Overflow",
  20: "InvalidAddress",
};

/**
 * The contract (or the host's auth check) rejected the call during
 * simulation, so nothing was submitted. `name` is the contract error variant,
 * or "Unauthorized" for a missing/invalid authorization.
 */
export class ContractError extends Error {
  constructor(
    readonly method: string,
    readonly code: number | null,
    readonly errorName: string,
  ) {
    super(`Contract rejected ${method}: ${errorName}${code === null ? "" : ` (#${code})`}`);
    this.name = "ContractError";
  }
}

/** Maps a simulation failure string to a ContractError when recognisable. */
function toContractError(method: string, message: string): ContractError | null {
  const contract = message.match(/Error\(Contract, #(\d+)\)/);
  if (contract) {
    const code = Number(contract[1]);
    return new ContractError(method, code, CONTRACT_ERRORS[code] ?? "Unknown");
  }
  if (/Error\(Auth,/.test(message)) {
    return new ContractError(method, null, "Unauthorized");
  }
  return null;
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
 * token sub-transfers in `purchase`). A contract rejection during simulation
 * throws ContractError and submits nothing.
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

    let prepared;
    try {
      prepared = await server.prepareTransaction(tx);
    } catch (error) {
      throw toContractError(method, String(error)) ?? error;
    }
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

/**
 * Simulates one invocation without submitting it and returns the decoded
 * return value. Read-only views use the issuer as source (any funded account
 * works). `source` + `authMode: "enforce"` evaluates the call exactly as the
 * network would for that signer — used to show that forbidden actions fail.
 */
async function simulateContract(
  method: string,
  args: xdr.ScVal[],
  options: { contractId?: string; source?: string; authMode?: rpc.Api.SimulationAuthMode } = {},
): Promise<unknown> {
  return withTimeoutRetry(`simulate ${method}`, async () => {
    const server = getRpc();
    const account = await server.getAccount(options.source ?? stellarConfig.usdcIssuerPublic);
    const contract = new Contract(options.contractId ?? stellarConfig.marketplaceContractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(60)
      .build();

    const sim = await server.simulateTransaction(tx, undefined, options.authMode);
    if (rpc.Api.isSimulationError(sim)) {
      throw (
        toContractError(method, sim.error) ??
        new Error(`${method} simulation failed: ${sim.error}`)
      );
    }
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      throw new Error(`${method} simulation returned no result`);
    }
    return scValToNative(sim.result.retval);
  });
}

/** Registers a classic marketplace instance on-chain. Returns its on-chain id. */
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

/**
 * Registers a Community Rewards marketplace: the community share of each
 * purchase stays in the contract treasury, booked per period.
 */
export async function createRewardsMarketplace(params: {
  operatorSecret: string;
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
}): Promise<{ marketplaceId: bigint; txHash: string }> {
  const operator = Keypair.fromSecret(params.operatorSecret);
  const { txHash, returnValue } = await invokeContract(
    "create_rewards_marketplace",
    [
      scAddress(operator.publicKey()),
      scU32(params.vendorBps),
      scU32(params.operatorBps),
      scU32(params.communityBps),
    ],
    operator,
  );
  if (!returnValue) {
    throw new Error("create_rewards_marketplace returned no value");
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
 * For rewards marketplaces `rewardsPeriodId` is the period the community
 * share was booked to; null for classic marketplaces.
 */
export async function purchase(params: {
  buyerSecret: string;
  marketplaceId: bigint;
  vendorPublicKey: string;
  amountStroops: bigint;
}): Promise<{ txHash: string; rewardsPeriodId: number | null }> {
  const buyer = Keypair.fromSecret(params.buyerSecret);
  const { txHash, returnValue } = await invokeContract(
    "purchase",
    [
      scU64(params.marketplaceId),
      scAddress(buyer.publicKey()),
      scAddress(params.vendorPublicKey),
      scI128(params.amountStroops),
    ],
    buyer,
  );
  const period = returnValue ? (scValToNative(returnValue) as number | null | undefined) : null;
  return { txHash, rewardsPeriodId: period ?? null };
}

/** Read-only config lookup via simulation (no transaction submitted). */
export async function getMarketplace(
  marketplaceId: bigint,
): Promise<MarketplaceConfigOnChain> {
  const raw = (await simulateContract("get_marketplace", [scU64(marketplaceId)])) as {
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
}

// ── Community Rewards ──────────────────────────────────────────────────────

export interface RewardsStatusOnChain {
  periodCount: number;
  totalContributedStroops: bigint;
  totalClaimedStroops: bigint;
  /** Ledger timestamp (seconds) the view was evaluated at. */
  ledgerTime: number;
}

export interface RewardsPeriodOnChain {
  periodId: number;
  startTs: number;
  endTs: number;
  beneficiaries: string[];
  sharesBps: number[];
  totalContributedStroops: bigint;
  totalClaimedStroops: bigint;
  closed: boolean;
}

export interface EntitlementOnChain {
  member: string;
  shareBps: number;
  amountStroops: bigint;
  claimed: boolean;
}

/**
 * Opens the next rewards period (operator-signed). Shares are basis points
 * parallel to `beneficiaries`; `endTs` is a ledger timestamp in seconds.
 */
export async function openRewardsPeriod(params: {
  operatorSecret: string;
  marketplaceId: bigint;
  beneficiaries: string[];
  sharesBps: number[];
  endTs: number;
}): Promise<{ periodId: number; txHash: string }> {
  const operator = Keypair.fromSecret(params.operatorSecret);
  const { txHash, returnValue } = await invokeContract(
    "open_period",
    [
      scU64(params.marketplaceId),
      xdr.ScVal.scvVec(params.beneficiaries.map(scAddress)),
      xdr.ScVal.scvVec(params.sharesBps.map(scU32)),
      scU64(BigInt(params.endTs)),
    ],
    operator,
  );
  if (!returnValue) throw new Error("open_period returned no value");
  return { periodId: scValToNative(returnValue) as number, txHash };
}

/**
 * Closes an ended period. The contract requires no authorization, so any
 * funded account may sign (the API uses the operator's).
 */
export async function closeRewardsPeriod(params: {
  signerSecret: string;
  marketplaceId: bigint;
  periodId: number;
}): Promise<{ totalStroops: bigint; txHash: string }> {
  const signer = Keypair.fromSecret(params.signerSecret);
  const { txHash, returnValue } = await invokeContract(
    "close_period",
    [scU64(params.marketplaceId), scU32(params.periodId)],
    signer,
  );
  return {
    totalStroops: returnValue ? BigInt(scValToNative(returnValue) as bigint) : 0n,
    txHash,
  };
}

/** Claims a member's entitlement, signed by the member's own key. */
export async function claimReward(params: {
  memberSecret: string;
  marketplaceId: bigint;
  periodId: number;
}): Promise<{ amountStroops: bigint; txHash: string }> {
  const member = Keypair.fromSecret(params.memberSecret);
  const { txHash, returnValue } = await invokeContract(
    "claim",
    [scU64(params.marketplaceId), scU32(params.periodId), scAddress(member.publicKey())],
    member,
  );
  return {
    amountStroops: returnValue ? BigInt(scValToNative(returnValue) as bigint) : 0n,
    txHash,
  };
}

export async function getRewardsStatus(marketplaceId: bigint): Promise<RewardsStatusOnChain> {
  const raw = (await simulateContract("rewards_status", [scU64(marketplaceId)])) as {
    period_count: number;
    total_contributed: bigint;
    total_claimed: bigint;
    now: bigint;
  };
  return {
    periodCount: raw.period_count,
    totalContributedStroops: BigInt(raw.total_contributed),
    totalClaimedStroops: BigInt(raw.total_claimed),
    ledgerTime: Number(raw.now),
  };
}

export async function getRewardsPeriod(
  marketplaceId: bigint,
  periodId: number,
): Promise<RewardsPeriodOnChain> {
  const raw = (await simulateContract("get_period", [
    scU64(marketplaceId),
    scU32(periodId),
  ])) as {
    start_ts: bigint;
    end_ts: bigint;
    beneficiaries: string[];
    shares_bps: number[];
    total_contributed: bigint;
    total_claimed: bigint;
    closed: boolean;
  };
  return {
    periodId,
    startTs: Number(raw.start_ts),
    endTs: Number(raw.end_ts),
    beneficiaries: raw.beneficiaries,
    sharesBps: raw.shares_bps.map(Number),
    totalContributedStroops: BigInt(raw.total_contributed),
    totalClaimedStroops: BigInt(raw.total_claimed),
    closed: raw.closed,
  };
}

/** Final entitlements of a closed period, in beneficiary order. */
export async function getRewardsEntitlements(
  marketplaceId: bigint,
  periodId: number,
): Promise<EntitlementOnChain[]> {
  const raw = (await simulateContract("get_entitlements", [
    scU64(marketplaceId),
    scU32(periodId),
  ])) as { member: string; share_bps: number; amount: bigint; claimed: boolean }[];
  return raw.map((e) => ({
    member: e.member,
    shareBps: Number(e.share_bps),
    amountStroops: BigInt(e.amount),
    claimed: e.claimed,
  }));
}

/**
 * Simulates `method` on `contractId` in ENFORCED auth mode with the source
 * account's own authorization attached for the root call — i.e. exactly what
 * the network would do with a transaction the source fully signed. Any extra
 * authorization the call needs (e.g. another address's) is missing, so it
 * fails just as it would on-chain. Throws ContractError on rejection.
 */
async function simulateSignedBy(
  source: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<void> {
  await withTimeoutRetry(`simulate ${method} as ${source.slice(0, 6)}`, async () => {
    const server = getRpc();
    const account = await server.getAccount(source);
    const invokeArgs = new xdr.InvokeContractArgs({
      contractAddress: Address.fromString(contractId).toScAddress(),
      functionName: method,
      args,
    });
    const sourceAuth = new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
      rootInvocation: new xdr.SorobanAuthorizedInvocation({
        function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invokeArgs),
        subInvocations: [],
      }),
    });
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func: xdr.HostFunction.hostFunctionTypeInvokeContract(invokeArgs),
          auth: [sourceAuth],
        }),
      )
      .setTimeout(60)
      .build();
    const sim = await server.simulateTransaction(tx, undefined, "enforce");
    if (rpc.Api.isSimulationError(sim)) {
      throw (
        toContractError(method, sim.error) ??
        new Error(`${method} simulation failed: ${sim.error}`)
      );
    }
  });
}

export type ForbiddenActionResult =
  | { rejected: true; reason: string; control: string }
  | { rejected: false; control: string };

/**
 * Guarantee checks for the demo: evaluates a forbidden action with the
 * operator's full authorization against the live contracts and reports the
 * rejection. Nothing is ever submitted. Each check first runs a positive
 * control through the same harness, so a rejection can't be an artefact of
 * the simulation setup.
 *   - "change-rules": while a period runs, the operator re-opens it sending
 *     100% to a different address. Control: the operator's authorization is
 *     accepted (the contract gets past require_auth to its PeriodActive rule).
 *   - "withdraw": the operator moves treasury tokens out of the contract via
 *     the token contract, bypassing the marketplace contract. Control: the
 *     same call moving the operator's OWN tokens is accepted.
 */
export async function simulateForbiddenAction(params: {
  kind: "change-rules" | "withdraw";
  operatorPublicKey: string;
  marketplaceId: bigint;
  amountStroops: bigint;
}): Promise<ForbiddenActionResult> {
  const attempt = async (run: () => Promise<void>) => {
    try {
      await run();
      return null;
    } catch (error) {
      if (error instanceof ContractError) return error.errorName;
      throw error;
    }
  };

  if (params.kind === "change-rules") {
    const outsider = Keypair.random().publicKey();
    const reason = await attempt(() =>
      simulateSignedBy(params.operatorPublicKey, stellarConfig.marketplaceContractId, "open_period", [
        scU64(params.marketplaceId),
        xdr.ScVal.scvVec([scAddress(outsider)]),
        xdr.ScVal.scvVec([scU32(10_000)]),
        scU64(BigInt(Math.floor(Date.now() / 1000) + 3_600)),
      ]),
    );
    // A contract-level error (not "Unauthorized") means the operator's
    // authorization was accepted and the contract's own rule said no.
    const control = reason !== null && reason !== "Unauthorized" ? "operator auth accepted" : "n/a";
    return reason === null ? { rejected: false, control } : { rejected: true, reason, control };
  }

  const token = stellarConfig.usdcSacAddress;
  const amount = scI128(params.amountStroops > 0n ? params.amountStroops : 1n);
  const controlReason = await attempt(() =>
    simulateSignedBy(params.operatorPublicKey, token, "transfer", [
      scAddress(params.operatorPublicKey),
      scAddress(params.operatorPublicKey),
      scI128(0n),
    ]),
  );
  if (controlReason !== null) {
    throw new Error(`withdraw check: positive control failed (${controlReason})`);
  }
  const reason = await attempt(() =>
    simulateSignedBy(params.operatorPublicKey, token, "transfer", [
      scAddress(stellarConfig.marketplaceContractId),
      scAddress(params.operatorPublicKey),
      amount,
    ]),
  );
  const control = "operator moving its own tokens: accepted";
  return reason === null ? { rejected: false, control } : { rejected: true, reason, control };
}
