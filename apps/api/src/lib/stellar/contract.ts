// Typed wrappers around the Compaki marketplace Soroban contract.
// Build → simulate → sign (server-held keys) → submit → poll, with one retry
// on timeout. Nothing outside src/lib/stellar may talk to the chain.

import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  Transaction,
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
  8: "InvalidRecipients",
  9: "InvalidRewardsConfig",
  10: "PeriodNotFound",
  11: "PeriodNotEnded",
  12: "NothingToClaim",
  13: "AlreadyClaimed",
  14: "FundraiseNotEnabled",
  15: "GoalNotReached",
  16: "InvalidGoal",
  17: "Overflow",
  18: "InvalidAddress",
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
 * A transaction prepared for a signer whose key Compaki doesn't hold (the
 * user's Cavos wallet). The browser signs `xdr` with the wallet and sends the
 * signed envelope back; `hash` is what the signed envelope must still hash to.
 */
export interface PreparedTx {
  xdr: string;
  hash: string;
  source: string;
}

/** Transactions signed in the browser get longer time bounds. */
const USER_SIGNING_TIMEOUT_S = 180;

/**
 * Builds and simulates one contract invocation with `source` as the
 * transaction source (whose signature then covers its `require_auth`, as a
 * source-account credential), and returns it assembled with the simulated
 * footprint and fees, unsigned. A contract rejection throws ContractError.
 */
async function prepareInvocation(
  method: string,
  args: xdr.ScVal[],
  source: string,
  timeoutSeconds = 60,
): Promise<Transaction> {
  const server = getRpc();
  const account = await getAccountWithWait(server, source);
  const contract = new Contract(stellarConfig.marketplaceContractId);

  const tx = new TransactionBuilder(account, {
    fee: (Number(BASE_FEE) * 1_000).toString(), // generous cap; actual fee comes from simulation
    networkPassphrase: stellarConfig.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(timeoutSeconds)
    .build();

  try {
    return await server.prepareTransaction(tx);
  } catch (error) {
    throw toContractError(method, String(error)) ?? error;
  }
}

/** Submits a fully signed transaction and polls until it is confirmed. */
async function sendAndConfirm(signed: Transaction, label: string): Promise<InvokeResult> {
  const server = getRpc();
  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    throw new Error(
      `Transaction submission failed for ${label}: ${JSON.stringify(sent.errorResult ?? sent.status)}`,
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
        `Transaction ${sent.hash} failed on-chain (${label}): ${result.resultXdr?.toXDR("base64") ?? "no result"}`,
      );
    }
    await sleep(1_500);
  }
  throw new Error(`Transaction ${sent.hash} timed out waiting for confirmation (${label})`);
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
    const prepared = await prepareInvocation(method, args, signer.publicKey());
    // The server signs only as the source account. If the call also needs
    // another address's authorization (e.g. the operator's), it would fail
    // on-chain after paying the fee, so refuse it here instead.
    const others = authorizersOf(prepared).filter((a) => a !== signer.publicKey());
    if (others.length > 0) throw new ContractError(method, null, "Unauthorized");
    prepared.sign(signer);
    return sendAndConfirm(prepared, method);
  });
}

/** Addresses whose own signature (not the source account's) a prepared call needs. */
function authorizersOf(tx: Transaction): string[] {
  return tx.operations.flatMap((op) =>
    op.type === "invokeHostFunction"
      ? (op.auth ?? []).flatMap((entry) => {
          const credentials = entry.credentials();
          return credentials.switch() === xdr.SorobanCredentialsType.sorobanCredentialsAddress()
            ? [Address.fromScAddress(credentials.address().address()).toString()]
            : [];
        })
      : [],
  );
}

/** The signed envelope from the browser isn't the transaction we prepared. */
export class SignedTxMismatchError extends Error {
  constructor(reason: string) {
    super(`Signed transaction rejected: ${reason}`);
    this.name = "SignedTxMismatchError";
  }
}

/**
 * Checks a transaction the user signed in their wallet: it must still hash to
 * the transaction Compaki prepared (so the client can't swap in a different
 * one) and carry a valid signature from `signer`. Returns the parsed
 * transaction; throws SignedTxMismatchError otherwise.
 */
export function checkUserSignedXdr(params: {
  signedXdr: string;
  expectedHash: string;
  signer: string;
}): Transaction {
  let tx;
  try {
    tx = TransactionBuilder.fromXDR(params.signedXdr, stellarConfig.networkPassphrase);
  } catch {
    throw new SignedTxMismatchError("not a valid transaction envelope");
  }
  if (!(tx instanceof Transaction)) throw new SignedTxMismatchError("fee-bump envelopes are not accepted");
  const hash = tx.hash();
  if (hash.toString("hex") !== params.expectedHash) {
    throw new SignedTxMismatchError("it differs from the prepared transaction");
  }
  const key = Keypair.fromPublicKey(params.signer);
  const hint = key.signatureHint();
  const signedByUser = tx.signatures.some(
    (s) => s.hint().equals(hint) && key.verify(hash, s.signature()),
  );
  if (!signedByUser) throw new SignedTxMismatchError("it is not signed by your wallet");
  return tx;
}

/**
 * Submits a transaction the user signed in the browser (Cavos `signXdr`, or
 * an existing wallet's signTransaction) after checkUserSignedXdr. Works for
 * contract invocations and classic transactions alike.
 */
export async function submitUserSignedXdr(params: {
  signedXdr: string;
  expectedHash: string;
  signer: string;
  label: string;
}): Promise<InvokeResult> {
  return sendAndConfirm(checkUserSignedXdr(params), params.label);
}

/**
 * Sign-in challenge for an existing Stellar wallet (SEP-10 style): a
 * transaction from the user's account with sequence number 0 — so it can
 * never be valid on-chain — carrying the nonce in a manageData operation and
 * a 5-minute time bound. Every wallet can sign transactions, while plain
 * message signing is not universal; the API only verifies the signature and
 * never submits it.
 */
export function buildLoginChallengeTx(params: { address: string; nonce: string }): PreparedTx {
  const tx = new TransactionBuilder(new Account(params.address, "-1"), {
    fee: BASE_FEE,
    networkPassphrase: stellarConfig.networkPassphrase,
  })
    .addOperation(Operation.manageData({ name: "Compaki sign-in", value: params.nonce }))
    .setTimeout(300)
    .build();
  return toPrepared(tx);
}

function toPrepared(tx: Transaction): PreparedTx {
  return { xdr: tx.toXDR(), hash: tx.hash().toString("hex"), source: tx.source };
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
 * purchase stays in the contract and, per period of `periodSeconds` (counted
 * from now), is shared between that period's vendors (`vendorPoolBps`) and
 * buyers (the rest), in proportion to their sales and purchases.
 */
export async function createRewardsMarketplace(params: {
  operatorSecret: string;
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
  periodSeconds: number;
  vendorPoolBps: number;
}): Promise<{ marketplaceId: bigint; txHash: string }> {
  const operator = Keypair.fromSecret(params.operatorSecret);
  const { txHash, returnValue } = await invokeContract(
    "create_rewards_marketplace",
    [
      scAddress(operator.publicKey()),
      scU32(params.vendorBps),
      scU32(params.operatorBps),
      scU32(params.communityBps),
      scU64(BigInt(params.periodSeconds)),
      scU32(params.vendorPoolBps),
    ],
    operator,
  );
  if (!returnValue) {
    throw new Error("create_rewards_marketplace returned no value");
  }
  return { marketplaceId: scValToNative(returnValue) as bigint, txHash };
}

/** What follows a released fundraising round by default (contract `GoalPolicy`). */
export type GoalPolicy = "stop" | "new-round";

const GOAL_POLICY_VARIANT: Record<GoalPolicy, string> = {
  stop: "Stop",
  "new-round": "NewRound",
};

/** `Option<T>`: None is Void, Some(x) is x itself. */
function scOption(value: xdr.ScVal | null): xdr.ScVal {
  return value ?? xdr.ScVal.scvVoid();
}

function scSymbolMap(entries: Record<string, xdr.ScVal>): xdr.ScVal {
  // contracttype structs are maps with their field names sorted.
  return xdr.ScVal.scvMap(
    Object.keys(entries)
      .sort()
      .map((key) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val: entries[key] })),
  );
}

/** A unit enum variant is encoded as a vector holding its name. */
function scGoalPolicy(policy: GoalPolicy): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(GOAL_POLICY_VARIANT[policy])]);
}

function goalPolicyOf(raw: unknown): GoalPolicy {
  const name = Array.isArray(raw) ? raw[0] : raw;
  const entry = Object.entries(GOAL_POLICY_VARIANT).find(([, variant]) => variant === name);
  if (!entry) throw new Error(`Unknown goal policy ${String(name)}`);
  return entry[0] as GoalPolicy;
}

/**
 * Registers a fundraising marketplace: the community share of each purchase
 * stays in the contract until a round raises `targetStroops`, then is
 * released to `recipients` at `sharesBps` (summing to 10_000).
 */
export async function createFundraiseMarketplace(params: {
  operatorSecret: string;
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
  targetStroops: bigint;
  recipients: string[];
  sharesBps: number[];
  policy: GoalPolicy;
}): Promise<{ marketplaceId: bigint; txHash: string }> {
  const operator = Keypair.fromSecret(params.operatorSecret);
  const { txHash, returnValue } = await invokeContract(
    "create_fundraise_marketplace",
    [
      scAddress(operator.publicKey()),
      scU32(params.vendorBps),
      scU32(params.operatorBps),
      scU32(params.communityBps),
      scI128(params.targetStroops),
      xdr.ScVal.scvVec(params.recipients.map(scAddress)),
      xdr.ScVal.scvVec(params.sharesBps.map(scU32)),
      scGoalPolicy(params.policy),
    ],
    operator,
  );
  if (!returnValue) {
    throw new Error("create_fundraise_marketplace returned no value");
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
 * The receipt is what the contract actually paid (see PurchaseReceipt).
 */
export async function purchase(params: {
  buyerSecret: string;
  marketplaceId: bigint;
  vendorPublicKey: string;
  amountStroops: bigint;
}): Promise<{ txHash: string; receipt: PurchaseReceipt }> {
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
  return { txHash, receipt: purchaseReceiptOf(returnValue) };
}

/**
 * Prepares a purchase for a buyer whose wallet signs in the browser. Submit
 * it with submitUserSignedXdr and decode the result with purchaseReceiptOf.
 */
export async function preparePurchase(params: {
  buyerPublicKey: string;
  marketplaceId: bigint;
  vendorPublicKey: string;
  amountStroops: bigint;
}): Promise<PreparedTx> {
  return withTimeoutRetry("prepare purchase", async () =>
    toPrepared(
      await prepareInvocation(
        "purchase",
        [
          scU64(params.marketplaceId),
          scAddress(params.buyerPublicKey),
          scAddress(params.vendorPublicKey),
          scI128(params.amountStroops),
        ],
        params.buyerPublicKey,
        USER_SIGNING_TIMEOUT_S,
      ),
    ),
  );
}

/** What a confirmed purchase paid, as returned by the contract. */
export interface PurchaseReceipt {
  vendorStroops: bigint;
  operatorStroops: bigint;
  /** 0 when a stopped fundraiser gave the community share to the vendor. */
  communityStroops: bigint;
  platformStroops: bigint;
  /** Rewards marketplaces: the period the purchase was booked to. */
  period: number | null;
  /** Fundraising marketplaces: the round the community share was added to (null once stopped). */
  round: number | null;
}

export function purchaseReceiptOf(returnValue: xdr.ScVal | undefined): PurchaseReceipt {
  if (!returnValue) throw new Error("purchase returned no receipt");
  const raw = scValToNative(returnValue) as {
    vendor_amount: bigint;
    operator_amount: bigint;
    community_amount: bigint;
    platform_amount: bigint;
    period?: number | null;
    round?: number | null;
  };
  return {
    vendorStroops: BigInt(raw.vendor_amount),
    operatorStroops: BigInt(raw.operator_amount),
    communityStroops: BigInt(raw.community_amount),
    platformStroops: BigInt(raw.platform_amount),
    period: raw.period ?? null,
    round: raw.round ?? null,
  };
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
  currentPeriod: number;
  periodStart: number;
  /** The current period can be distributed from this ledger time on. */
  periodEnd: number;
  periodSeconds: number;
  vendorPoolBps: number;
  buyerPoolBps: number;
  totalContributedStroops: bigint;
  totalClaimedStroops: bigint;
  /** Ledger timestamp (seconds) the view was evaluated at. */
  ledgerTime: number;
}

export interface PeriodTotalsOnChain {
  startTs: number;
  /** 0 until distributed. */
  endTs: number;
  vendorPoolBps: number;
  vendorPoolStroops: bigint;
  buyerPoolStroops: bigint;
  vendorVolumeStroops: bigint;
  buyerVolumeStroops: bigint;
  totalClaimedStroops: bigint;
  distributed: boolean;
}

export interface RewardOnChain {
  vendorVolumeStroops: bigint;
  buyerVolumeStroops: bigint;
  /** Final once the period is distributed; a running estimate before that. */
  amountStroops: bigint;
  periodEnded: boolean;
  claimed: boolean;
}

/** Rules for the next rewards period (contract `RewardsRules`). */
export interface RewardsRules {
  vendorPoolBps: number;
  buyerPoolBps: number;
  periodSeconds: number;
}

/**
 * Ends the current rewards period once its length has passed and starts the
 * next one. Without `next` anyone may submit it (the API uses the issuer as
 * fee payer); with `next` the signer must be the marketplace operator.
 */
export async function distributeRewards(params: {
  signerSecret: string;
  marketplaceId: bigint;
  next: RewardsRules | null;
}): Promise<{ poolStroops: bigint; txHash: string }> {
  const signer = Keypair.fromSecret(params.signerSecret);
  const next = params.next
    ? scSymbolMap({
        vendor_pool_bps: scU32(params.next.vendorPoolBps),
        buyer_pool_bps: scU32(params.next.buyerPoolBps),
        period_seconds: scU64(BigInt(params.next.periodSeconds)),
      })
    : null;
  const { txHash, returnValue } = await invokeContract(
    "distribute",
    [scU64(params.marketplaceId), scOption(next)],
    signer,
  );
  return { poolStroops: i128Of(returnValue), txHash };
}

/** Claims a participant's reward, signed by the participant's own key. */
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
  return { amountStroops: i128Of(returnValue), txHash };
}

/** Prepares a claim for a participant whose wallet signs in the browser. */
export async function prepareClaim(params: {
  memberPublicKey: string;
  marketplaceId: bigint;
  periodId: number;
}): Promise<PreparedTx> {
  return withTimeoutRetry("prepare claim", async () =>
    toPrepared(
      await prepareInvocation(
        "claim",
        [scU64(params.marketplaceId), scU32(params.periodId), scAddress(params.memberPublicKey)],
        params.memberPublicKey,
        USER_SIGNING_TIMEOUT_S,
      ),
    ),
  );
}

/** Decodes an i128 contract return value (claim or release amount). */
export function i128Of(returnValue: xdr.ScVal | undefined): bigint {
  return returnValue ? BigInt(scValToNative(returnValue) as bigint) : 0n;
}

export async function getRewardsStatus(marketplaceId: bigint): Promise<RewardsStatusOnChain> {
  const raw = (await simulateContract("rewards_status", [scU64(marketplaceId)])) as {
    current_period: number;
    period_start: bigint;
    period_end: bigint;
    period_seconds: bigint;
    vendor_pool_bps: number;
    buyer_pool_bps: number;
    total_contributed: bigint;
    total_claimed: bigint;
    now: bigint;
  };
  return {
    currentPeriod: Number(raw.current_period),
    periodStart: Number(raw.period_start),
    periodEnd: Number(raw.period_end),
    periodSeconds: Number(raw.period_seconds),
    vendorPoolBps: Number(raw.vendor_pool_bps),
    buyerPoolBps: Number(raw.buyer_pool_bps),
    totalContributedStroops: BigInt(raw.total_contributed),
    totalClaimedStroops: BigInt(raw.total_claimed),
    ledgerTime: Number(raw.now),
  };
}

export async function getPeriodTotals(
  marketplaceId: bigint,
  periodId: number,
): Promise<PeriodTotalsOnChain> {
  const raw = (await simulateContract("get_period", [scU64(marketplaceId), scU32(periodId)])) as {
    start_ts: bigint;
    end_ts: bigint;
    vendor_pool_bps: number;
    vendor_pool: bigint;
    buyer_pool: bigint;
    vendor_volume: bigint;
    buyer_volume: bigint;
    total_claimed: bigint;
    distributed: boolean;
  };
  return {
    startTs: Number(raw.start_ts),
    endTs: Number(raw.end_ts),
    vendorPoolBps: Number(raw.vendor_pool_bps),
    distributed: raw.distributed,
    vendorPoolStroops: BigInt(raw.vendor_pool),
    buyerPoolStroops: BigInt(raw.buyer_pool),
    vendorVolumeStroops: BigInt(raw.vendor_volume),
    buyerVolumeStroops: BigInt(raw.buyer_volume),
    totalClaimedStroops: BigInt(raw.total_claimed),
  };
}

/** One address's reward for a period, as the contract computes it. */
export async function getReward(
  marketplaceId: bigint,
  periodId: number,
  member: string,
): Promise<RewardOnChain> {
  const raw = (await simulateContract("get_reward", [
    scU64(marketplaceId),
    scU32(periodId),
    scAddress(member),
  ])) as {
    vendor_volume: bigint;
    buyer_volume: bigint;
    amount: bigint;
    period_ended: boolean;
    claimed: boolean;
  };
  return {
    vendorVolumeStroops: BigInt(raw.vendor_volume),
    buyerVolumeStroops: BigInt(raw.buyer_volume),
    amountStroops: BigInt(raw.amount),
    periodEnded: raw.period_ended,
    claimed: raw.claimed,
  };
}

// ── Fundraising ────────────────────────────────────────────────────────────

export interface FundraiseOnChain {
  targetStroops: bigint;
  recipients: string[];
  sharesBps: number[];
  policy: GoalPolicy;
  round: number;
  raisedStroops: bigint;
  totalRaisedStroops: bigint;
  totalReleasedStroops: bigint;
  goalReached: boolean;
  /** False once fundraising stopped. */
  collecting: boolean;
}

export async function getFundraise(marketplaceId: bigint): Promise<FundraiseOnChain> {
  const raw = (await simulateContract("get_fundraise", [scU64(marketplaceId)])) as {
    target: bigint;
    recipients: string[];
    shares_bps: number[];
    policy: unknown;
    round: number;
    raised: bigint;
    total_raised: bigint;
    total_released: bigint;
    goal_reached: boolean;
    collecting: boolean;
  };
  return {
    targetStroops: BigInt(raw.target),
    recipients: raw.recipients,
    sharesBps: raw.shares_bps.map(Number),
    policy: goalPolicyOf(raw.policy),
    round: Number(raw.round),
    raisedStroops: BigInt(raw.raised),
    totalRaisedStroops: BigInt(raw.total_raised),
    totalReleasedStroops: BigInt(raw.total_released),
    goalReached: raw.goal_reached,
    collecting: raw.collecting,
  };
}

/**
 * Releases a round that reached its target. Without `nextTargetStroops` the
 * contract applies the marketplace's default (same target again, or stop)
 * and anyone may submit it — the API pays the fee with the demo-asset issuer
 * account. With a next target (0 = stop) the signer must be the operator.
 */
export async function releaseFundraise(params: {
  signerSecret: string;
  marketplaceId: bigint;
  nextTargetStroops?: bigint | null;
}): Promise<{ amountStroops: bigint; txHash: string }> {
  const signer = Keypair.fromSecret(params.signerSecret);
  const next = params.nextTargetStroops === undefined || params.nextTargetStroops === null
    ? null
    : scI128(params.nextTargetStroops);
  const { txHash, returnValue } = await invokeContract(
    "release_fundraise",
    [scU64(params.marketplaceId), scOption(next)],
    signer,
  );
  return { amountStroops: i128Of(returnValue), txHash };
}

/** Code version of the deployed contract (bumped on every upgrade). */
export async function getContractVersion(): Promise<number> {
  return Number(await simulateContract("version", []));
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
 *   - "claim-for-someone": the operator signs a claim for a participant's
 *     address (the payout would go to the participant, but the contract
 *     requires the participant's own signature). Control:
 *     the operator signing a claim for its OWN address passes authorization
 *     (the contract then answers with its own rule, e.g. NothingToClaim).
 *   - "withdraw": the operator moves treasury tokens out of the contract via
 *     the token contract, bypassing the marketplace contract. Control: the
 *     same call moving the operator's OWN tokens is accepted.
 */
export async function simulateForbiddenAction(params: {
  kind: "claim-for-someone" | "withdraw";
  operatorPublicKey: string;
  marketplaceId: bigint;
  amountStroops: bigint;
  /** claim-for-someone: the participant and period to try. */
  participant?: string;
  periodId?: number;
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

  if (params.kind === "claim-for-someone") {
    const periodId = params.periodId ?? 0;
    const claimAs = (member: string) =>
      simulateSignedBy(params.operatorPublicKey, stellarConfig.marketplaceContractId, "claim", [
        scU64(params.marketplaceId),
        scU32(periodId),
        scAddress(member),
      ]);
    // A contract-level error (not "Unauthorized") for its own address means
    // the operator's authorization was accepted by the harness.
    const controlReason = await attempt(() => claimAs(params.operatorPublicKey));
    if (controlReason === "Unauthorized") {
      throw new Error("claim check: positive control failed (Unauthorized)");
    }
    const participant = params.participant ?? Keypair.random().publicKey();
    const reason = await attempt(() => claimAs(participant));
    const control = "operator claiming for its own address: authorization accepted";
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
