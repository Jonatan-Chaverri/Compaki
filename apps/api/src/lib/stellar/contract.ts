// Typed wrappers around the Compaki marketplace Soroban contract.
// Build → simulate → sign (server-held keys) → submit → poll, with one retry
// on timeout. Nothing outside src/lib/stellar may talk to the chain.
//
// The contract's interface — every function's argument and result types and
// how they are encoded — comes from the TypeScript client generated from the
// contract with Scaffold Stellar (generated/marketplace.ts, `npm run
// contract:client`). Calls are built with callOf and results decoded with
// resultOf, so a contract change that this file doesn't follow fails the
// typecheck instead of failing on-chain.

import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  contract,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";

import { stellarConfig } from "./config";
import { Client as MarketplaceClient, Errors as MarketplaceErrors, type GoalPolicy as GoalPolicyValue } from "./generated/marketplace";
import { ConfirmationTimeoutError, sleep, withTimeoutRetry } from "./retry";

/** The contract functions, as the generated client declares them. */
type Method = {
  [K in keyof MarketplaceClient]: MarketplaceClient[K] extends (...args: never[]) => Promise<contract.AssembledTransaction<unknown>>
    ? K
    : never;
}[keyof MarketplaceClient];
/** A function's arguments (functions without any take `{}`). */
type ArgsOf<M extends Method> = Parameters<MarketplaceClient[M]>[0];
/** A function's return value, unwrapped from the contract's `Result`. */
type ResultOf<M extends Method> =
  Awaited<ReturnType<MarketplaceClient[M]>> extends contract.AssembledTransaction<infer R>
    ? R extends contract.Result<infer T> ? T : R
    : never;

let marketplaceSpec: contract.Spec | undefined;

/** The contract spec embedded in the generated client. */
function spec(): contract.Spec {
  marketplaceSpec ??= new MarketplaceClient({
    contractId: stellarConfig.marketplaceContractId,
    networkPassphrase: stellarConfig.networkPassphrase,
    rpcUrl: stellarConfig.rpcUrl,
  }).spec;
  return marketplaceSpec;
}

/** Encodes a call to `method` from typed arguments. */
export function callOf<M extends Method>(method: M, args: ArgsOf<M>): ContractCall {
  return { method, args: spec().funcArgsToScVals(method, (args ?? {}) as object) };
}

/** Decodes `method`'s return value. */
export function resultOf<M extends Method>(method: M, value: xdr.ScVal | undefined): ResultOf<M> {
  if (!value) throw new Error(`${method} returned no value`);
  const decoded = spec().funcResToNative(method, value) as unknown;
  if (decoded instanceof contract.Err) throw new Error(`${method} returned an error: ${decoded.unwrapErr().message}`);
  return (decoded instanceof contract.Ok ? decoded.unwrap() : decoded) as ResultOf<M>;
}

export interface MarketplaceConfigOnChain {
  operator: string;
  communityFund: string;
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
}

/** Contract error codes (contracts/marketplace/src/lib.rs `Error`, via the generated client). */
export const CONTRACT_ERRORS: Record<number, string> = Object.fromEntries(
  Object.entries(MarketplaceErrors).map(([code, { message }]) => [Number(code), message]),
);

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
  throw new ConfirmationTimeoutError(`Transaction ${sent.hash} timed out waiting for confirmation (${label})`);
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
): Promise<xdr.ScVal> {
  return withTimeoutRetry(`simulate ${method}`, async () => {
    const server = getRpc();
    const account = await server.getAccount(options.source ?? stellarConfig.usdcIssuerPublic);
    const target = new Contract(options.contractId ?? stellarConfig.marketplaceContractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(target.call(method, ...args))
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
    return sim.result.retval;
  });
}

/** Reads a view of the marketplace contract (simulation, nothing submitted). */
async function view<M extends Method>(method: M, args: ArgsOf<M>): Promise<ResultOf<M>> {
  const call = callOf(method, args);
  return resultOf(method, await simulateContract(call.method, call.args));
}

/**
 * One contract invocation, built once and signed either with a key the
 * backend holds (invokeCall) or in the user's own wallet (prepareCall, then
 * submitUserSignedXdr). Who must sign is the call's own business: e.g. the
 * operator for create_* and set_next_*, the vendor for join.
 */
export interface ContractCall {
  method: string;
  args: xdr.ScVal[];
}

/** Signs and submits `call` with a custodial key (also the fee payer). */
export function invokeCall(call: ContractCall, signerSecret: string): Promise<InvokeResult> {
  return invokeContract(call.method, call.args, Keypair.fromSecret(signerSecret));
}

/** Prepares `call` for `source`'s wallet to sign in the browser. */
export function prepareCall(call: ContractCall, source: string): Promise<PreparedTx> {
  return withTimeoutRetry(`prepare ${call.method}`, async () =>
    toPrepared(await prepareInvocation(call.method, call.args, source, USER_SIGNING_TIMEOUT_S)),
  );
}

/** The new marketplace's on-chain id, from a confirmed create_* call (all three return it). */
export function marketplaceIdOf(returnValue: xdr.ScVal | undefined): bigint {
  return resultOf("create_marketplace", returnValue);
}

interface SplitParams {
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
}

function splitArgs(params: SplitParams) {
  return { vendor_bps: params.vendorBps, operator_bps: params.operatorBps, community_bps: params.communityBps };
}

export function createMarketplaceCall(params: SplitParams & { operator: string; communityFund: string }): ContractCall {
  return callOf("create_marketplace", {
    operator: params.operator,
    community_fund: params.communityFund,
    ...splitArgs(params),
  });
}

/** Registers a classic marketplace instance on-chain. Returns its on-chain id. */
export async function createMarketplace(params: SplitParams & {
  operatorSecret: string;
  communityFundPublicKey: string;
}): Promise<{ marketplaceId: bigint; txHash: string }> {
  const operator = Keypair.fromSecret(params.operatorSecret).publicKey();
  const call = createMarketplaceCall({ ...params, operator, communityFund: params.communityFundPublicKey });
  const { txHash, returnValue } = await invokeCall(call, params.operatorSecret);
  return { marketplaceId: marketplaceIdOf(returnValue), txHash };
}

/**
 * Registers a Community Rewards marketplace: the community share of each
 * purchase stays in the contract and, per period of `periodSeconds` (counted
 * from now), is shared between that period's vendors (`vendorPoolBps`) and
 * buyers (the rest), in proportion to their sales and purchases.
 */
export async function createRewardsMarketplace(params: SplitParams & {
  operatorSecret: string;
  periodSeconds: number;
  vendorPoolBps: number;
}): Promise<{ marketplaceId: bigint; txHash: string }> {
  const operator = Keypair.fromSecret(params.operatorSecret).publicKey();
  const { txHash, returnValue } = await invokeCall(
    createRewardsMarketplaceCall({ ...params, operator }),
    params.operatorSecret,
  );
  return { marketplaceId: marketplaceIdOf(returnValue), txHash };
}

export function createRewardsMarketplaceCall(params: SplitParams & {
  operator: string;
  periodSeconds: number;
  vendorPoolBps: number;
}): ContractCall {
  return callOf("create_rewards_marketplace", {
    operator: params.operator,
    ...splitArgs(params),
    period_seconds: BigInt(params.periodSeconds),
    vendor_pool_bps: params.vendorPoolBps,
  });
}

/** What follows a released fundraising round by default (contract `GoalPolicy`). */
export type GoalPolicy = "stop" | "new-round";

const GOAL_POLICY_VARIANT: Record<GoalPolicy, GoalPolicyValue["tag"]> = {
  stop: "Stop",
  "new-round": "NewRound",
};

function goalPolicyValue(policy: GoalPolicy): GoalPolicyValue {
  return { tag: GOAL_POLICY_VARIANT[policy], values: undefined } as GoalPolicyValue;
}

function goalPolicyOf(value: GoalPolicyValue): GoalPolicy {
  const entry = Object.entries(GOAL_POLICY_VARIANT).find(([, variant]) => variant === value.tag);
  if (!entry) throw new Error(`Unknown goal policy ${value.tag}`);
  return entry[0] as GoalPolicy;
}

/**
 * Registers a fundraising marketplace: the community share of each purchase
 * stays in the contract until a round raises `targetStroops`, then is
 * released to `recipients` at `sharesBps` (summing to 10_000).
 */
export async function createFundraiseMarketplace(params: FundraiseParams & {
  operatorSecret: string;
}): Promise<{ marketplaceId: bigint; txHash: string }> {
  const operator = Keypair.fromSecret(params.operatorSecret).publicKey();
  const { txHash, returnValue } = await invokeCall(
    createFundraiseMarketplaceCall({ ...params, operator }),
    params.operatorSecret,
  );
  return { marketplaceId: marketplaceIdOf(returnValue), txHash };
}

interface FundraiseParams extends SplitParams {
  targetStroops: bigint;
  recipients: string[];
  sharesBps: number[];
  policy: GoalPolicy;
}

export function createFundraiseMarketplaceCall(params: FundraiseParams & { operator: string }): ContractCall {
  return callOf("create_fundraise_marketplace", {
    operator: params.operator,
    ...splitArgs(params),
    target: params.targetStroops,
    recipients: params.recipients,
    shares_bps: params.sharesBps,
    policy: goalPolicyValue(params.policy),
  });
}

/**
 * A vendor registering itself in a marketplace, with its own signature
 * (contract `join`); used when the operator's key isn't available to the
 * backend.
 */
export function joinCall(params: { marketplaceId: bigint; vendor: string }): ContractCall {
  return callOf("join", { marketplace_id: params.marketplaceId, vendor: params.vendor });
}

/** `Option<RewardsRules>` for the contract (None when null). */
function rulesValue(rules: RewardsRules | null) {
  return rules
    ? { vendor_pool_bps: rules.vendorPoolBps, buyer_pool_bps: rules.buyerPoolBps, period_seconds: BigInt(rules.periodSeconds) }
    : undefined;
}

function rulesOf(value: { vendor_pool_bps: number; buyer_pool_bps: number; period_seconds: bigint }): RewardsRules {
  return {
    vendorPoolBps: Number(value.vendor_pool_bps),
    buyerPoolBps: Number(value.buyer_pool_bps),
    periodSeconds: Number(value.period_seconds),
  };
}

/** Schedules (or with null clears) the next rewards period's rules; operator-signed. */
export function setNextRulesCall(params: { marketplaceId: bigint; rules: RewardsRules | null }): ContractCall {
  return callOf("set_next_rules", { marketplace_id: params.marketplaceId, rules: rulesValue(params.rules) });
}

/** Schedules (or with null clears) the next fundraising round's target, 0 = stop; operator-signed. */
export function setNextTargetCall(params: { marketplaceId: bigint; targetStroops: bigint | null }): ContractCall {
  return callOf("set_next_target", { marketplace_id: params.marketplaceId, target: params.targetStroops ?? undefined });
}

/** Registers a vendor; must be signed by the marketplace's operator. */
export async function registerVendor(params: {
  operatorSecret: string;
  marketplaceId: bigint;
  vendorPublicKey: string;
}): Promise<{ txHash: string }> {
  const call = callOf("register_vendor", { marketplace_id: params.marketplaceId, vendor: params.vendorPublicKey });
  const { txHash } = await invokeCall(call, params.operatorSecret);
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
  const buyer = Keypair.fromSecret(params.buyerSecret).publicKey();
  const { txHash, returnValue } = await invokeCall(
    purchaseCall({ ...params, buyerPublicKey: buyer }),
    params.buyerSecret,
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
  return prepareCall(purchaseCall(params), params.buyerPublicKey);
}

function purchaseCall(params: {
  buyerPublicKey: string;
  marketplaceId: bigint;
  vendorPublicKey: string;
  amountStroops: bigint;
}): ContractCall {
  return callOf("purchase", {
    marketplace_id: params.marketplaceId,
    buyer: params.buyerPublicKey,
    vendor: params.vendorPublicKey,
    amount: params.amountStroops,
  });
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
  const raw = resultOf("purchase", returnValue);
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
  const raw = await view("get_marketplace", { marketplace_id: marketplaceId });
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
 * fee payer) and the contract applies the rules the operator scheduled with
 * set_next_rules, if any; with `next` the signer must be the operator.
 */
export async function distributeRewards(params: {
  signerSecret: string;
  marketplaceId: bigint;
  next: RewardsRules | null;
}): Promise<{ poolStroops: bigint; txHash: string }> {
  const call = callOf("distribute", { marketplace_id: params.marketplaceId, next: rulesValue(params.next) });
  const { txHash, returnValue } = await invokeCall(call, params.signerSecret);
  return { poolStroops: resultOf("distribute", returnValue), txHash };
}

/** Claims a participant's reward, signed by the participant's own key. */
export async function claimReward(params: {
  memberSecret: string;
  marketplaceId: bigint;
  periodId: number;
}): Promise<{ amountStroops: bigint; txHash: string }> {
  const member = Keypair.fromSecret(params.memberSecret).publicKey();
  const call = callOf("claim", { marketplace_id: params.marketplaceId, period: params.periodId, member });
  const { txHash, returnValue } = await invokeCall(call, params.memberSecret);
  return { amountStroops: resultOf("claim", returnValue), txHash };
}

/** Prepares a claim for a participant whose wallet signs in the browser. */
export async function prepareClaim(params: {
  memberPublicKey: string;
  marketplaceId: bigint;
  periodId: number;
}): Promise<PreparedTx> {
  const call = callOf("claim", {
    marketplace_id: params.marketplaceId,
    period: params.periodId,
    member: params.memberPublicKey,
  });
  return prepareCall(call, params.memberPublicKey);
}

/** The amount a confirmed claim paid out. */
export function claimedAmountOf(returnValue: xdr.ScVal | undefined): bigint {
  return resultOf("claim", returnValue);
}

export async function getRewardsStatus(marketplaceId: bigint): Promise<RewardsStatusOnChain> {
  const raw = await view("rewards_status", { marketplace_id: marketplaceId });
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
  const raw = await view("get_period", { marketplace_id: marketplaceId, period: periodId });
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
  const raw = await view("get_reward", { marketplace_id: marketplaceId, period: periodId, member });
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
  const raw = await view("get_fundraise", { marketplace_id: marketplaceId });
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
 * Releases a round that reached its target. Without `nextTargetStroops`
 * anyone may submit it — the API pays the fee with the demo-asset issuer
 * account — and the contract applies the target the operator scheduled with
 * set_next_target, or else the marketplace's default (same target again, or
 * stop). With a next target (0 = stop) the signer must be the operator.
 */
export async function releaseFundraise(params: {
  signerSecret: string;
  marketplaceId: bigint;
  nextTargetStroops?: bigint | null;
}): Promise<{ amountStroops: bigint; txHash: string }> {
  const call = callOf("release_fundraise", {
    marketplace_id: params.marketplaceId,
    next_target: params.nextTargetStroops ?? undefined,
  });
  const { txHash, returnValue } = await invokeCall(call, params.signerSecret);
  return { amountStroops: resultOf("release_fundraise", returnValue), txHash };
}

/** Rules scheduled on-chain for the next rewards period, if any. */
export async function getNextRules(marketplaceId: bigint): Promise<RewardsRules | null> {
  const raw = await view("get_next_rules", { marketplace_id: marketplaceId });
  return raw ? rulesOf(raw) : null;
}

/** Target scheduled on-chain for the next fundraising round (stroops, 0 = stop), if any. */
export async function getNextTarget(marketplaceId: bigint): Promise<bigint | null> {
  const raw = await view("get_next_target", { marketplace_id: marketplaceId });
  return raw === null || raw === undefined ? null : BigInt(raw);
}

/** Code version of the deployed contract (bumped on every upgrade). */
export async function getContractVersion(): Promise<number> {
  return Number(await view("version", {}));
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
      simulateSignedBy(
        params.operatorPublicKey,
        stellarConfig.marketplaceContractId,
        "claim",
        callOf("claim", { marketplace_id: params.marketplaceId, period: periodId, member }).args,
      );
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

  // The demo asset's token contract (a Stellar Asset Contract, SEP-41):
  // transfer(from, to, amount).
  const token = stellarConfig.usdcSacAddress;
  const transferArgs = (from: string, to: string, amount: bigint) => [
    nativeToScVal(from, { type: "address" }),
    nativeToScVal(to, { type: "address" }),
    nativeToScVal(amount, { type: "i128" }),
  ];
  const controlReason = await attempt(() =>
    simulateSignedBy(
      params.operatorPublicKey,
      token,
      "transfer",
      transferArgs(params.operatorPublicKey, params.operatorPublicKey, 0n),
    ),
  );
  if (controlReason !== null) {
    throw new Error(`withdraw check: positive control failed (${controlReason})`);
  }
  const reason = await attempt(() =>
    simulateSignedBy(
      params.operatorPublicKey,
      token,
      "transfer",
      transferArgs(
        stellarConfig.marketplaceContractId,
        params.operatorPublicKey,
        params.amountStroops > 0n ? params.amountStroops : 1n,
      ),
    ),
  );
  const control = "operator moving its own tokens: accepted";
  return reason === null ? { rejected: false, control } : { rejected: true, reason, control };
}
