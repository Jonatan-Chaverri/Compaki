import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CC7YO6HMHHUNOAKTFEVHOIDVFLXAOG7PX4LLOGHZ6SYHX2W2DIALPTM5",
  }
} as const

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidSplit"},
  4: {message:"MarketplaceNotFound"},
  5: {message:"VendorNotRegistered"},
  6: {message:"InvalidAmount"},
  /**
   * The marketplace was not created with Community Rewards.
   */
  7: {message:"RewardsNotEnabled"},
  /**
   * Empty/oversized list, length mismatch, zero share, duplicate, shares
   * not summing to 10_000, or the contract itself as a recipient.
   */
  8: {message:"InvalidRecipients"},
  /**
   * Period length out of bounds, or a vendor pool above 100%.
   */
  9: {message:"InvalidRewardsConfig"},
  /**
   * A period that has not started yet.
   */
  10: {message:"PeriodNotFound"},
  /**
   * `distribute` before the period's length has passed, or `claim` before
   * the period was distributed.
   */
  11: {message:"PeriodNotEnded"},
  /**
   * The address did not sell or buy in that period (or its reward rounds
   * down to zero).
   */
  12: {message:"NothingToClaim"},
  13: {message:"AlreadyClaimed"},
  /**
   * The marketplace was not created with a fundraising target.
   */
  14: {message:"FundraiseNotEnabled"},
  /**
   * `release_fundraise` while the current round is below the target.
   */
  15: {message:"GoalNotReached"},
  /**
   * A fundraising target of zero or less at creation, or a negative next target.
   */
  16: {message:"InvalidGoal"},
  17: {message:"Overflow"},
  /**
   * The contract itself as a community fund or platform recipient.
   */
  18: {message:"InvalidAddress"}
}

export type DataKey = {tag: "Admin", values: void} | {tag: "Token", values: void} | {tag: "Platform", values: void} | {tag: "NextId", values: void} | {tag: "Config", values: readonly [u64]} | {tag: "Vendor", values: readonly [u64, string]} | {tag: "Rewards", values: readonly [u64]} | {tag: "Period", values: readonly [u64, u32]} | {tag: "Participation", values: readonly [u64, u32, string]} | {tag: "Fundraise", values: readonly [u64]} | {tag: "NextRules", values: readonly [u64]} | {tag: "NextTarget", values: readonly [u64]};

/**
 * The default for what follows a released round (the operator can pass a
 * different next target to `release_fundraise`).
 */
export type GoalPolicy = {tag: "Stop", values: void} | {tag: "NewRound", values: void};


/**
 * Read-only view of one address's reward for one period.
 */
export interface RewardView {
  /**
 * Final once the period is distributed; a running estimate before that.
 */
amount: i128;
  buyer_volume: i128;
  claimed: boolean;
  period_ended: boolean;
  vendor_volume: i128;
}


/**
 * One period's rules, pools and the sales volume they are shared over.
 * Every purchase adds its amount to both volumes (it has one vendor and one
 * buyer).
 */
export interface PeriodTotals {
  buyer_pool: i128;
  buyer_volume: i128;
  /**
 * Rewards of a period can be claimed once it is distributed.
 */
distributed: boolean;
  /**
 * 0 until the period is distributed.
 */
end_ts: u64;
  start_ts: u64;
  total_claimed: i128;
  vendor_pool: i128;
  vendor_pool_bps: u32;
  vendor_volume: i128;
}


/**
 * Rules for the next period, scheduled by the operator (`set_next_rules`) or
 * passed to `distribute`.
 */
export interface RewardsRules {
  buyer_pool_bps: u32;
  period_seconds: u64;
  vendor_pool_bps: u32;
}


/**
 * Community Rewards state: the running period, its rules, lifetime totals.
 */
export interface RewardsState {
  /**
 * The period purchases are booked to (0-based).
 */
current_period: u32;
  period_seconds: u64;
  /**
 * When the current period started; it can be distributed from
 * period_start + period_seconds on.
 */
period_start: u64;
  total_claimed: i128;
  total_contributed: i128;
  /**
 * Part of the current period's community pool shared among its vendors;
 * the rest (10_000 - vendor_pool_bps) is shared among its buyers.
 */
vendor_pool_bps: u32;
}


export interface Participation {
  /**
 * Purchases this address made as a buyer in the period.
 */
buyer_volume: i128;
  claimed: boolean;
  /**
 * Sales this address made as a vendor in the period.
 */
vendor_volume: i128;
}


/**
 * Payload of the event emitted on every purchase.
 */
export interface PurchaseEvent {
  amount: i128;
  buyer: string;
  community_amount: i128;
  operator_amount: i128;
  platform_amount: i128;
  vendor: string;
  vendor_amount: i128;
}


/**
 * Read-only summary returned by `rewards_status`.
 */
export interface RewardsStatus {
  buyer_pool_bps: u32;
  current_period: u32;
  /**
 * Ledger timestamp at which this view was evaluated.
 */
now: u64;
  /**
 * The current period can be distributed from this time on.
 */
period_end: u64;
  period_seconds: u64;
  period_start: u64;
  total_claimed: i128;
  total_contributed: i128;
  vendor_pool_bps: u32;
}


/**
 * Fundraising rules (recipients and shares fixed at creation) and progress.
 */
export interface FundraiseState {
  /**
 * False once fundraising stopped (a release with a next target of 0).
 */
collecting: boolean;
  /**
 * True once the first round has been released.
 */
goal_reached: boolean;
  policy: GoalPolicy;
  /**
 * Held by the contract for the current round.
 */
raised: i128;
  /**
 * Fixed at creation; parallel to `shares_bps`, which sum to 10_000.
 */
recipients: Array<string>;
  /**
 * The round currently raising (0-based); increments on every release.
 */
round: u32;
  shares_bps: Array<u32>;
  /**
 * The current round's target.
 */
target: i128;
  total_raised: i128;
  total_released: i128;
}


/**
 * Read-only view of the platform fee.
 */
export interface PlatformConfig {
  fee_bps: u32;
  recipient: string;
}


/**
 * What a purchase actually paid; returned by `purchase` and the amounts of
 * its event. The community amount is 0 when a stopped fundraiser gave it to
 * the vendor.
 */
export interface PurchaseReceipt {
  community_amount: i128;
  operator_amount: i128;
  /**
 * Rewards marketplaces: the period the purchase was booked to.
 */
period: Option<u32>;
  platform_amount: i128;
  /**
 * Fundraising marketplaces: the round the community share was added to
 * (None once fundraising has stopped).
 */
round: Option<u32>;
  vendor_amount: i128;
}


export interface MarketplaceConfig {
  community_bps: u32;
  /**
 * For rewards and fundraising marketplaces this is the contract's own
 * address: the community share stays in the contract treasury.
 */
community_fund: string;
  operator: string;
  operator_bps: u32;
  vendor_bps: u32;
}

export interface Client {
  /**
   * Construct and simulate a join transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers the caller as a vendor of a marketplace, with the vendor's
   * own signature (the app's open invite link), so the operator doesn't
   * have to be online to approve each one. Same effect as
   * `register_vendor`; registering twice is harmless.
   */
  join: ({marketplace_id, vendor}: {marketplace_id: u64, vendor: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pays `member` their reward for a distributed period: their share of
   * the vendor pool (by sales) plus their share of the buyer pool (by
   * purchases). Requires the member's own authorization; the payout always
   * goes to `member`, once.
   */
  claim: ({marketplace_id, period, member}: {marketplace_id: u64, period: u32, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replaces this contract's code with an uploaded wasm (by hash), keeping
   * its address and all stored data. Only the admin set at `initialize`.
   * New code must read the stored types as they are (add fields as new
   * storage keys rather than changing existing structs).
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The code version (CONTRACT_VERSION), to confirm an upgrade.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a purchase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Executes a purchase: atomically moves `amount` of the payment token
   * from the buyer to vendor / operator / community according to the
   * marketplace's split, plus the 2% platform fee to the platform
   * recipient — each leg a direct transfer from the buyer. The rounding
   * remainder always goes to the community share so no dust is ever lost.
   * 
   * Community share by mode:
   * - classic: to the community fund account;
   * - rewards: to this contract, booked to the current period together
   * with the vendor's and buyer's volume (until `distribute` closes it);
   * - fundraising: to this contract for the current round; once
   * fundraising has stopped it goes to the vendor instead.
   */
  purchase: ({marketplace_id, buyer, vendor, amount}: {marketplace_id: u64, buyer: string, vendor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<PurchaseReceipt>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The admin allowed to `upgrade`.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a distribute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Ends the current rewards period once its length has passed: its pools
   * become claimable and a new period starts now. Anyone may call it with
   * `next = None`, so nobody can hold the rewards back: the next period
   * uses the rules the operator scheduled with `set_next_rules`, or the
   * same ones. Passing `Some(rules)` sets the next period's pool shares and
   * length directly and requires the operator's authorization. The API
   * calls it right when the period is due. Returns the distributed pool
   * total.
   */
  distribute: ({marketplace_id, next}: {marketplace_id: u64, next: Option<RewardsRules>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a get_period transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A period's rules, pools and volumes (empty for a period without sales).
   */
  get_period: ({marketplace_id, period}: {marketplace_id: u64, period: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<PeriodTotals>>>

  /**
   * Construct and simulate a get_reward transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One address's reward for a period: final once the period is
   * distributed, a running estimate while it is still current.
   */
  get_reward: ({marketplace_id, period, member}: {marketplace_id: u64, period: u32, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<RewardView>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One-time setup: stores the admin, the payment token (demo USD SAC) and
   * the platform fee recipient. The admin's only privilege is `upgrade`.
   * None of these can be changed later.
   */
  initialize: ({admin, token, platform}: {admin: string, token: string, platform: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_platform transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The platform fee: its recipient and rate (fixed for this deployment).
   */
  get_platform: (options?: MethodOptions) => Promise<AssembledTransaction<Result<PlatformConfig>>>

  /**
   * Construct and simulate a get_fundraise transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Rules and progress of a fundraising marketplace.
   */
  get_fundraise: ({marketplace_id}: {marketplace_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<FundraiseState>>>

  /**
   * Construct and simulate a get_next_rules transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The rules scheduled for the next rewards period, if any.
   */
  get_next_rules: ({marketplace_id}: {marketplace_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Option<RewardsRules>>>>

  /**
   * Construct and simulate a rewards_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Rules, current period and lifetime totals of a rewards marketplace,
   * plus the ledger time the view was evaluated at.
   */
  rewards_status: ({marketplace_id}: {marketplace_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<RewardsStatus>>>

  /**
   * Construct and simulate a set_next_rules transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Schedules the rules of the next rewards period (pool shares and
   * length); the next `distribute`, whoever calls it, applies them. `None`
   * clears a schedule. Operator only. The running period is unaffected.
   */
  set_next_rules: ({marketplace_id, rules}: {marketplace_id: u64, rules: Option<RewardsRules>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_marketplace transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read-only accessor for a marketplace's split config.
   */
  get_marketplace: ({marketplace_id}: {marketplace_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<MarketplaceConfig>>>

  /**
   * Construct and simulate a get_next_target transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The target scheduled for the next fundraising round, if any.
   */
  get_next_target: ({marketplace_id}: {marketplace_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Option<i128>>>>

  /**
   * Construct and simulate a register_vendor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers a vendor in a marketplace. Only the marketplace's operator
   * may call this.
   */
  register_vendor: ({marketplace_id, vendor}: {marketplace_id: u64, vendor: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_next_target transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Schedules the next fundraising round's target (0 stops fundraising
   * after the current round); the next `release_fundraise`, whoever calls
   * it, applies it. `None` clears a schedule. Operator only, while the
   * fundraiser is still collecting.
   */
  set_next_target: ({marketplace_id, target}: {marketplace_id: u64, target: Option<i128>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a release_fundraise transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Releases a fundraising round that reached its target: pays everything
   * raised in it to the recipients at their fixed shares (rounding as in
   * `split_by_shares`). What follows depends on `next_target`:
   * - `None` (anyone may call): the target the operator scheduled with
   * `set_next_target`, or else the policy's default — a new round toward
   * the same target (NewRound) or stop (Stop);
   * - `Some(t)` (operator only): a new round toward `t`, or stop if t == 0.
   * Once stopped, later sales give the community share to the vendor.
   */
  release_fundraise: ({marketplace_id, next_target}: {marketplace_id: u64, next_target: Option<i128>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a create_marketplace transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers a classic marketplace (community share paid straight to the
   * `community_fund` account) and returns its id.
   * The three bps values must sum to exactly 9_800: the remaining 2% is
   * Compaki's fixed platform fee.
   */
  create_marketplace: ({operator, community_fund, vendor_bps, operator_bps, community_bps}: {operator: string, community_fund: string, vendor_bps: u32, operator_bps: u32, community_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a create_rewards_marketplace transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers a Community Rewards marketplace: the community share of each
   * purchase is held by this contract and, per period (the first one
   * starts now and lasts at least `period_seconds`), shared among that
   * period's vendors (`vendor_pool_bps` of the pool) and buyers (the rest),
   * in proportion to what each one sold or bought. `community_bps` must be
   * > 0. The pool split and length can change only for a next period, at
   * `distribute`.
   */
  create_rewards_marketplace: ({operator, vendor_bps, operator_bps, community_bps, period_seconds, vendor_pool_bps}: {operator: string, vendor_bps: u32, operator_bps: u32, community_bps: u32, period_seconds: u64, vendor_pool_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a create_fundraise_marketplace transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers a fundraising marketplace: the community share of each
   * purchase is held by this contract until the round reaches `target`,
   * then `release_fundraise` pays it to `recipients` at `shares_bps`
   * (summing to 10_000). `policy` is what follows a release by default.
   * Recipients and shares are fixed at creation and can never be edited.
   */
  create_fundraise_marketplace: ({operator, vendor_bps, operator_bps, community_bps, target, recipients, shares_bps, policy}: {operator: string, vendor_bps: u32, operator_bps: u32, community_bps: u32, target: i128, recipients: Array<string>, shares_bps: Array<u32>, policy: GoalPolicy}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAPBSZWdpc3RlcnMgdGhlIGNhbGxlciBhcyBhIHZlbmRvciBvZiBhIG1hcmtldHBsYWNlLCB3aXRoIHRoZSB2ZW5kb3Incwpvd24gc2lnbmF0dXJlICh0aGUgYXBwJ3Mgb3BlbiBpbnZpdGUgbGluayksIHNvIHRoZSBvcGVyYXRvciBkb2Vzbid0CmhhdmUgdG8gYmUgb25saW5lIHRvIGFwcHJvdmUgZWFjaCBvbmUuIFNhbWUgZWZmZWN0IGFzCmByZWdpc3Rlcl92ZW5kb3JgOyByZWdpc3RlcmluZyB0d2ljZSBpcyBoYXJtbGVzcy4AAAAEam9pbgAAAAIAAAAAAAAADm1hcmtldHBsYWNlX2lkAAAAAAAGAAAAAAAAAAZ2ZW5kb3IAAAAAABMAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAORQYXlzIGBtZW1iZXJgIHRoZWlyIHJld2FyZCBmb3IgYSBkaXN0cmlidXRlZCBwZXJpb2Q6IHRoZWlyIHNoYXJlIG9mCnRoZSB2ZW5kb3IgcG9vbCAoYnkgc2FsZXMpIHBsdXMgdGhlaXIgc2hhcmUgb2YgdGhlIGJ1eWVyIHBvb2wgKGJ5CnB1cmNoYXNlcykuIFJlcXVpcmVzIHRoZSBtZW1iZXIncyBvd24gYXV0aG9yaXphdGlvbjsgdGhlIHBheW91dCBhbHdheXMKZ29lcyB0byBgbWVtYmVyYCwgb25jZS4AAAAFY2xhaW0AAAAAAAADAAAAAAAAAA5tYXJrZXRwbGFjZV9pZAAAAAAABgAAAAAAAAAGcGVyaW9kAAAAAAAEAAAAAAAAAAZtZW1iZXIAAAAAABMAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAQNSZXBsYWNlcyB0aGlzIGNvbnRyYWN0J3MgY29kZSB3aXRoIGFuIHVwbG9hZGVkIHdhc20gKGJ5IGhhc2gpLCBrZWVwaW5nCml0cyBhZGRyZXNzIGFuZCBhbGwgc3RvcmVkIGRhdGEuIE9ubHkgdGhlIGFkbWluIHNldCBhdCBgaW5pdGlhbGl6ZWAuCk5ldyBjb2RlIG11c3QgcmVhZCB0aGUgc3RvcmVkIHR5cGVzIGFzIHRoZXkgYXJlIChhZGQgZmllbGRzIGFzIG5ldwpzdG9yYWdlIGtleXMgcmF0aGVyIHRoYW4gY2hhbmdpbmcgZXhpc3Rpbmcgc3RydWN0cykuAAAAAAd1cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAADtUaGUgY29kZSB2ZXJzaW9uIChDT05UUkFDVF9WRVJTSU9OKSwgdG8gY29uZmlybSBhbiB1cGdyYWRlLgAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAAAQ=",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAEgAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAMSW52YWxpZFNwbGl0AAAAAwAAAAAAAAATTWFya2V0cGxhY2VOb3RGb3VuZAAAAAAEAAAAAAAAABNWZW5kb3JOb3RSZWdpc3RlcmVkAAAAAAUAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAGAAAAN1RoZSBtYXJrZXRwbGFjZSB3YXMgbm90IGNyZWF0ZWQgd2l0aCBDb21tdW5pdHkgUmV3YXJkcy4AAAAAEVJld2FyZHNOb3RFbmFibGVkAAAAAAAABwAAAIJFbXB0eS9vdmVyc2l6ZWQgbGlzdCwgbGVuZ3RoIG1pc21hdGNoLCB6ZXJvIHNoYXJlLCBkdXBsaWNhdGUsIHNoYXJlcwpub3Qgc3VtbWluZyB0byAxMF8wMDAsIG9yIHRoZSBjb250cmFjdCBpdHNlbGYgYXMgYSByZWNpcGllbnQuAAAAAAARSW52YWxpZFJlY2lwaWVudHMAAAAAAAAIAAAAOVBlcmlvZCBsZW5ndGggb3V0IG9mIGJvdW5kcywgb3IgYSB2ZW5kb3IgcG9vbCBhYm92ZSAxMDAlLgAAAAAAABRJbnZhbGlkUmV3YXJkc0NvbmZpZwAAAAkAAAAiQSBwZXJpb2QgdGhhdCBoYXMgbm90IHN0YXJ0ZWQgeWV0LgAAAAAADlBlcmlvZE5vdEZvdW5kAAAAAAAKAAAAYWBkaXN0cmlidXRlYCBiZWZvcmUgdGhlIHBlcmlvZCdzIGxlbmd0aCBoYXMgcGFzc2VkLCBvciBgY2xhaW1gIGJlZm9yZQp0aGUgcGVyaW9kIHdhcyBkaXN0cmlidXRlZC4AAAAAAAAOUGVyaW9kTm90RW5kZWQAAAAAAAsAAABTVGhlIGFkZHJlc3MgZGlkIG5vdCBzZWxsIG9yIGJ1eSBpbiB0aGF0IHBlcmlvZCAob3IgaXRzIHJld2FyZCByb3VuZHMKZG93biB0byB6ZXJvKS4AAAAADk5vdGhpbmdUb0NsYWltAAAAAAAMAAAAAAAAAA5BbHJlYWR5Q2xhaW1lZAAAAAAADQAAADpUaGUgbWFya2V0cGxhY2Ugd2FzIG5vdCBjcmVhdGVkIHdpdGggYSBmdW5kcmFpc2luZyB0YXJnZXQuAAAAAAATRnVuZHJhaXNlTm90RW5hYmxlZAAAAAAOAAAAQGByZWxlYXNlX2Z1bmRyYWlzZWAgd2hpbGUgdGhlIGN1cnJlbnQgcm91bmQgaXMgYmVsb3cgdGhlIHRhcmdldC4AAAAOR29hbE5vdFJlYWNoZWQAAAAAAA8AAABMQSBmdW5kcmFpc2luZyB0YXJnZXQgb2YgemVybyBvciBsZXNzIGF0IGNyZWF0aW9uLCBvciBhIG5lZ2F0aXZlIG5leHQgdGFyZ2V0LgAAAAtJbnZhbGlkR29hbAAAAAAQAAAAAAAAAAhPdmVyZmxvdwAAABEAAAA+VGhlIGNvbnRyYWN0IGl0c2VsZiBhcyBhIGNvbW11bml0eSBmdW5kIG9yIHBsYXRmb3JtIHJlY2lwaWVudC4AAAAAAA5JbnZhbGlkQWRkcmVzcwAAAAAAEg==",
        "AAAAAAAAAo1FeGVjdXRlcyBhIHB1cmNoYXNlOiBhdG9taWNhbGx5IG1vdmVzIGBhbW91bnRgIG9mIHRoZSBwYXltZW50IHRva2VuCmZyb20gdGhlIGJ1eWVyIHRvIHZlbmRvciAvIG9wZXJhdG9yIC8gY29tbXVuaXR5IGFjY29yZGluZyB0byB0aGUKbWFya2V0cGxhY2UncyBzcGxpdCwgcGx1cyB0aGUgMiUgcGxhdGZvcm0gZmVlIHRvIHRoZSBwbGF0Zm9ybQpyZWNpcGllbnQg4oCUIGVhY2ggbGVnIGEgZGlyZWN0IHRyYW5zZmVyIGZyb20gdGhlIGJ1eWVyLiBUaGUgcm91bmRpbmcKcmVtYWluZGVyIGFsd2F5cyBnb2VzIHRvIHRoZSBjb21tdW5pdHkgc2hhcmUgc28gbm8gZHVzdCBpcyBldmVyIGxvc3QuCgpDb21tdW5pdHkgc2hhcmUgYnkgbW9kZToKLSBjbGFzc2ljOiB0byB0aGUgY29tbXVuaXR5IGZ1bmQgYWNjb3VudDsKLSByZXdhcmRzOiB0byB0aGlzIGNvbnRyYWN0LCBib29rZWQgdG8gdGhlIGN1cnJlbnQgcGVyaW9kIHRvZ2V0aGVyCndpdGggdGhlIHZlbmRvcidzIGFuZCBidXllcidzIHZvbHVtZSAodW50aWwgYGRpc3RyaWJ1dGVgIGNsb3NlcyBpdCk7Ci0gZnVuZHJhaXNpbmc6IHRvIHRoaXMgY29udHJhY3QgZm9yIHRoZSBjdXJyZW50IHJvdW5kOyBvbmNlCmZ1bmRyYWlzaW5nIGhhcyBzdG9wcGVkIGl0IGdvZXMgdG8gdGhlIHZlbmRvciBpbnN0ZWFkLgAAAAAAAAhwdXJjaGFzZQAAAAQAAAAAAAAADm1hcmtldHBsYWNlX2lkAAAAAAAGAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAABnZlbmRvcgAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAfQAAAAD1B1cmNoYXNlUmVjZWlwdAAAAAAD",
        "AAAAAAAAAB9UaGUgYWRtaW4gYWxsb3dlZCB0byBgdXBncmFkZWAuAAAAAAlnZXRfYWRtaW4AAAAAAAAAAAAAAQAAA+kAAAATAAAAAw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAADAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAFVG9rZW4AAAAAAAAAAAAAN1JlY2lwaWVudCBvZiB0aGUgcGxhdGZvcm0gZmVlIChzZXQgb25jZSBhdCBpbml0aWFsaXplKS4AAAAACFBsYXRmb3JtAAAAAAAAAAAAAAAGTmV4dElkAAAAAAABAAAALE1hcmtldHBsYWNlIGNvbmZpZywga2V5ZWQgYnkgbWFya2V0cGxhY2VfaWQuAAAABkNvbmZpZwAAAAAAAQAAAAYAAAABAAAAPFZlbmRvciByZWdpc3RyYXRpb24gZmxhZywga2V5ZWQgYnkgKG1hcmtldHBsYWNlX2lkLCB2ZW5kb3IpLgAAAAZWZW5kb3IAAAAAAAIAAAAGAAAAEwAAAAEAAAA/Q29tbXVuaXR5IFJld2FyZHMgc3RhdGU7IHByZXNlbnQgb25seSBmb3IgcmV3YXJkcyBtYXJrZXRwbGFjZXMuAAAAAAdSZXdhcmRzAAAAAAEAAAAGAAAAAQAAADlSZXdhcmRzIHBlcmlvZCB0b3RhbHMsIGtleWVkIGJ5IChtYXJrZXRwbGFjZV9pZCwgcGVyaW9kKS4AAAAAAAAGUGVyaW9kAAAAAAACAAAABgAAAAQAAAABAAAAaFdoYXQgb25lIGFkZHJlc3Mgc29sZCBhbmQgYm91Z2h0IGluIGEgcGVyaW9kLCBhbmQgd2hldGhlciBpdCBjbGFpbWVkOgoobWFya2V0cGxhY2VfaWQsIHBlcmlvZCwgYWRkcmVzcykuAAAADVBhcnRpY2lwYXRpb24AAAAAAAADAAAABgAAAAQAAAATAAAAAQAAAD1GdW5kcmFpc2luZyBzdGF0ZTsgcHJlc2VudCBvbmx5IGZvciBmdW5kcmFpc2luZyBtYXJrZXRwbGFjZXMuAAAAAAAACUZ1bmRyYWlzZQAAAAAAAAEAAAAGAAAAAQAAAGlSdWxlcyB0aGUgb3BlcmF0b3Igc2NoZWR1bGVkIGZvciB0aGUgbmV4dCByZXdhcmRzIHBlcmlvZDsgdGhlIG5leHQKYGRpc3RyaWJ1dGVgIGFwcGxpZXMgYW5kIHJlbW92ZXMgdGhlbS4AAAAAAAAJTmV4dFJ1bGVzAAAAAAAAAQAAAAYAAAABAAAAiFRhcmdldCB0aGUgb3BlcmF0b3Igc2NoZWR1bGVkIGZvciB0aGUgbmV4dCBmdW5kcmFpc2luZyByb3VuZCAoMCBzdG9wcwpmdW5kcmFpc2luZyk7IHRoZSBuZXh0IGByZWxlYXNlX2Z1bmRyYWlzZWAgYXBwbGllcyBhbmQgcmVtb3ZlcyBpdC4AAAAKTmV4dFRhcmdldAAAAAAAAQAAAAY=",
        "AAAAAAAAAelFbmRzIHRoZSBjdXJyZW50IHJld2FyZHMgcGVyaW9kIG9uY2UgaXRzIGxlbmd0aCBoYXMgcGFzc2VkOiBpdHMgcG9vbHMKYmVjb21lIGNsYWltYWJsZSBhbmQgYSBuZXcgcGVyaW9kIHN0YXJ0cyBub3cuIEFueW9uZSBtYXkgY2FsbCBpdCB3aXRoCmBuZXh0ID0gTm9uZWAsIHNvIG5vYm9keSBjYW4gaG9sZCB0aGUgcmV3YXJkcyBiYWNrOiB0aGUgbmV4dCBwZXJpb2QKdXNlcyB0aGUgcnVsZXMgdGhlIG9wZXJhdG9yIHNjaGVkdWxlZCB3aXRoIGBzZXRfbmV4dF9ydWxlc2AsIG9yIHRoZQpzYW1lIG9uZXMuIFBhc3NpbmcgYFNvbWUocnVsZXMpYCBzZXRzIHRoZSBuZXh0IHBlcmlvZCdzIHBvb2wgc2hhcmVzIGFuZApsZW5ndGggZGlyZWN0bHkgYW5kIHJlcXVpcmVzIHRoZSBvcGVyYXRvcidzIGF1dGhvcml6YXRpb24uIFRoZSBBUEkKY2FsbHMgaXQgcmlnaHQgd2hlbiB0aGUgcGVyaW9kIGlzIGR1ZS4gUmV0dXJucyB0aGUgZGlzdHJpYnV0ZWQgcG9vbAp0b3RhbC4AAAAAAAAKZGlzdHJpYnV0ZQAAAAAAAgAAAAAAAAAObWFya2V0cGxhY2VfaWQAAAAAAAYAAAAAAAAABG5leHQAAAPoAAAH0AAAAAxSZXdhcmRzUnVsZXMAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAEdBIHBlcmlvZCdzIHJ1bGVzLCBwb29scyBhbmQgdm9sdW1lcyAoZW1wdHkgZm9yIGEgcGVyaW9kIHdpdGhvdXQgc2FsZXMpLgAAAAAKZ2V0X3BlcmlvZAAAAAAAAgAAAAAAAAAObWFya2V0cGxhY2VfaWQAAAAAAAYAAAAAAAAABnBlcmlvZAAAAAAABAAAAAEAAAPpAAAH0AAAAAxQZXJpb2RUb3RhbHMAAAAD",
        "AAAAAAAAAHZPbmUgYWRkcmVzcydzIHJld2FyZCBmb3IgYSBwZXJpb2Q6IGZpbmFsIG9uY2UgdGhlIHBlcmlvZCBpcwpkaXN0cmlidXRlZCwgYSBydW5uaW5nIGVzdGltYXRlIHdoaWxlIGl0IGlzIHN0aWxsIGN1cnJlbnQuAAAAAAAKZ2V0X3Jld2FyZAAAAAAAAwAAAAAAAAAObWFya2V0cGxhY2VfaWQAAAAAAAYAAAAAAAAABnBlcmlvZAAAAAAABAAAAAAAAAAGbWVtYmVyAAAAAAATAAAAAQAAA+kAAAfQAAAAClJld2FyZFZpZXcAAAAAAAM=",
        "AAAAAAAAAK9PbmUtdGltZSBzZXR1cDogc3RvcmVzIHRoZSBhZG1pbiwgdGhlIHBheW1lbnQgdG9rZW4gKGRlbW8gVVNEIFNBQykgYW5kCnRoZSBwbGF0Zm9ybSBmZWUgcmVjaXBpZW50LiBUaGUgYWRtaW4ncyBvbmx5IHByaXZpbGVnZSBpcyBgdXBncmFkZWAuCk5vbmUgb2YgdGhlc2UgY2FuIGJlIGNoYW5nZWQgbGF0ZXIuAAAAAAppbml0aWFsaXplAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAIcGxhdGZvcm0AAAATAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAAEVUaGUgcGxhdGZvcm0gZmVlOiBpdHMgcmVjaXBpZW50IGFuZCByYXRlIChmaXhlZCBmb3IgdGhpcyBkZXBsb3ltZW50KS4AAAAAAAAMZ2V0X3BsYXRmb3JtAAAAAAAAAAEAAAPpAAAH0AAAAA5QbGF0Zm9ybUNvbmZpZwAAAAAAAw==",
        "AAAAAgAAAHVUaGUgZGVmYXVsdCBmb3Igd2hhdCBmb2xsb3dzIGEgcmVsZWFzZWQgcm91bmQgKHRoZSBvcGVyYXRvciBjYW4gcGFzcyBhCmRpZmZlcmVudCBuZXh0IHRhcmdldCB0byBgcmVsZWFzZV9mdW5kcmFpc2VgKS4AAAAAAAAAAAAACkdvYWxQb2xpY3kAAAAAAAIAAAAAAAAAR0Z1bmRyYWlzaW5nIGVuZHM6IGxhdGVyIHNhbGVzIGdpdmUgdGhlaXIgY29tbXVuaXR5IHNoYXJlIHRvIHRoZSB2ZW5kb3IuAAAAAARTdG9wAAAAAAAAAENBIG5ldyByb3VuZCBzdGFydHMgZnJvbSB6ZXJvIHRvd2FyZCB0aGUgc2FtZSB0YXJnZXQgYW5kIHJlY2lwaWVudHMuAAAAAAhOZXdSb3VuZA==",
        "AAAAAQAAADZSZWFkLW9ubHkgdmlldyBvZiBvbmUgYWRkcmVzcydzIHJld2FyZCBmb3Igb25lIHBlcmlvZC4AAAAAAAAAAAAKUmV3YXJkVmlldwAAAAAABQAAAEVGaW5hbCBvbmNlIHRoZSBwZXJpb2QgaXMgZGlzdHJpYnV0ZWQ7IGEgcnVubmluZyBlc3RpbWF0ZSBiZWZvcmUgdGhhdC4AAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAxidXllcl92b2x1bWUAAAALAAAAAAAAAAdjbGFpbWVkAAAAAAEAAAAAAAAADHBlcmlvZF9lbmRlZAAAAAEAAAAAAAAADXZlbmRvcl92b2x1bWUAAAAAAAAL",
        "AAAAAAAAADBSdWxlcyBhbmQgcHJvZ3Jlc3Mgb2YgYSBmdW5kcmFpc2luZyBtYXJrZXRwbGFjZS4AAAANZ2V0X2Z1bmRyYWlzZQAAAAAAAAEAAAAAAAAADm1hcmtldHBsYWNlX2lkAAAAAAAGAAAAAQAAA+kAAAfQAAAADkZ1bmRyYWlzZVN0YXRlAAAAAAAD",
        "AAAAAAAAADhUaGUgcnVsZXMgc2NoZWR1bGVkIGZvciB0aGUgbmV4dCByZXdhcmRzIHBlcmlvZCwgaWYgYW55LgAAAA5nZXRfbmV4dF9ydWxlcwAAAAAAAQAAAAAAAAAObWFya2V0cGxhY2VfaWQAAAAAAAYAAAABAAAD6QAAA+gAAAfQAAAADFJld2FyZHNSdWxlcwAAAAM=",
        "AAAAAAAAAHNSdWxlcywgY3VycmVudCBwZXJpb2QgYW5kIGxpZmV0aW1lIHRvdGFscyBvZiBhIHJld2FyZHMgbWFya2V0cGxhY2UsCnBsdXMgdGhlIGxlZGdlciB0aW1lIHRoZSB2aWV3IHdhcyBldmFsdWF0ZWQgYXQuAAAAAA5yZXdhcmRzX3N0YXR1cwAAAAAAAQAAAAAAAAAObWFya2V0cGxhY2VfaWQAAAAAAAYAAAABAAAD6QAAB9AAAAANUmV3YXJkc1N0YXR1cwAAAAAAAAM=",
        "AAAAAAAAAMpTY2hlZHVsZXMgdGhlIHJ1bGVzIG9mIHRoZSBuZXh0IHJld2FyZHMgcGVyaW9kIChwb29sIHNoYXJlcyBhbmQKbGVuZ3RoKTsgdGhlIG5leHQgYGRpc3RyaWJ1dGVgLCB3aG9ldmVyIGNhbGxzIGl0LCBhcHBsaWVzIHRoZW0uIGBOb25lYApjbGVhcnMgYSBzY2hlZHVsZS4gT3BlcmF0b3Igb25seS4gVGhlIHJ1bm5pbmcgcGVyaW9kIGlzIHVuYWZmZWN0ZWQuAAAAAAAOc2V0X25leHRfcnVsZXMAAAAAAAIAAAAAAAAADm1hcmtldHBsYWNlX2lkAAAAAAAGAAAAAAAAAAVydWxlcwAAAAAAA+gAAAfQAAAADFJld2FyZHNSdWxlcwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAQAAAJZPbmUgcGVyaW9kJ3MgcnVsZXMsIHBvb2xzIGFuZCB0aGUgc2FsZXMgdm9sdW1lIHRoZXkgYXJlIHNoYXJlZCBvdmVyLgpFdmVyeSBwdXJjaGFzZSBhZGRzIGl0cyBhbW91bnQgdG8gYm90aCB2b2x1bWVzIChpdCBoYXMgb25lIHZlbmRvciBhbmQgb25lCmJ1eWVyKS4AAAAAAAAAAAAMUGVyaW9kVG90YWxzAAAACQAAAAAAAAAKYnV5ZXJfcG9vbAAAAAAACwAAAAAAAAAMYnV5ZXJfdm9sdW1lAAAACwAAADpSZXdhcmRzIG9mIGEgcGVyaW9kIGNhbiBiZSBjbGFpbWVkIG9uY2UgaXQgaXMgZGlzdHJpYnV0ZWQuAAAAAAALZGlzdHJpYnV0ZWQAAAAAAQAAACIwIHVudGlsIHRoZSBwZXJpb2QgaXMgZGlzdHJpYnV0ZWQuAAAAAAAGZW5kX3RzAAAAAAAGAAAAAAAAAAhzdGFydF90cwAAAAYAAAAAAAAADXRvdGFsX2NsYWltZWQAAAAAAAALAAAAAAAAAAt2ZW5kb3JfcG9vbAAAAAALAAAAAAAAAA92ZW5kb3JfcG9vbF9icHMAAAAABAAAAAAAAAANdmVuZG9yX3ZvbHVtZQAAAAAAAAs=",
        "AAAAAQAAAGJSdWxlcyBmb3IgdGhlIG5leHQgcGVyaW9kLCBzY2hlZHVsZWQgYnkgdGhlIG9wZXJhdG9yIChgc2V0X25leHRfcnVsZXNgKSBvcgpwYXNzZWQgdG8gYGRpc3RyaWJ1dGVgLgAAAAAAAAAAAAxSZXdhcmRzUnVsZXMAAAADAAAAAAAAAA5idXllcl9wb29sX2JwcwAAAAAABAAAAAAAAAAOcGVyaW9kX3NlY29uZHMAAAAAAAYAAAAAAAAAD3ZlbmRvcl9wb29sX2JwcwAAAAAE",
        "AAAAAQAAAEhDb21tdW5pdHkgUmV3YXJkcyBzdGF0ZTogdGhlIHJ1bm5pbmcgcGVyaW9kLCBpdHMgcnVsZXMsIGxpZmV0aW1lIHRvdGFscy4AAAAAAAAADFJld2FyZHNTdGF0ZQAAAAYAAAAtVGhlIHBlcmlvZCBwdXJjaGFzZXMgYXJlIGJvb2tlZCB0byAoMC1iYXNlZCkuAAAAAAAADmN1cnJlbnRfcGVyaW9kAAAAAAAEAAAAAAAAAA5wZXJpb2Rfc2Vjb25kcwAAAAAABgAAAF1XaGVuIHRoZSBjdXJyZW50IHBlcmlvZCBzdGFydGVkOyBpdCBjYW4gYmUgZGlzdHJpYnV0ZWQgZnJvbQpwZXJpb2Rfc3RhcnQgKyBwZXJpb2Rfc2Vjb25kcyBvbi4AAAAAAAAMcGVyaW9kX3N0YXJ0AAAABgAAAAAAAAANdG90YWxfY2xhaW1lZAAAAAAAAAsAAAAAAAAAEXRvdGFsX2NvbnRyaWJ1dGVkAAAAAAAACwAAAIVQYXJ0IG9mIHRoZSBjdXJyZW50IHBlcmlvZCdzIGNvbW11bml0eSBwb29sIHNoYXJlZCBhbW9uZyBpdHMgdmVuZG9yczsKdGhlIHJlc3QgKDEwXzAwMCAtIHZlbmRvcl9wb29sX2JwcykgaXMgc2hhcmVkIGFtb25nIGl0cyBidXllcnMuAAAAAAAAD3ZlbmRvcl9wb29sX2JwcwAAAAAE",
        "AAAAAAAAADRSZWFkLW9ubHkgYWNjZXNzb3IgZm9yIGEgbWFya2V0cGxhY2UncyBzcGxpdCBjb25maWcuAAAAD2dldF9tYXJrZXRwbGFjZQAAAAABAAAAAAAAAA5tYXJrZXRwbGFjZV9pZAAAAAAABgAAAAEAAAPpAAAH0AAAABFNYXJrZXRwbGFjZUNvbmZpZwAAAAAAAAM=",
        "AAAAAAAAADxUaGUgdGFyZ2V0IHNjaGVkdWxlZCBmb3IgdGhlIG5leHQgZnVuZHJhaXNpbmcgcm91bmQsIGlmIGFueS4AAAAPZ2V0X25leHRfdGFyZ2V0AAAAAAEAAAAAAAAADm1hcmtldHBsYWNlX2lkAAAAAAAGAAAAAQAAA+kAAAPoAAAACwAAAAM=",
        "AAAAAAAAAFNSZWdpc3RlcnMgYSB2ZW5kb3IgaW4gYSBtYXJrZXRwbGFjZS4gT25seSB0aGUgbWFya2V0cGxhY2UncyBvcGVyYXRvcgptYXkgY2FsbCB0aGlzLgAAAAAPcmVnaXN0ZXJfdmVuZG9yAAAAAAIAAAAAAAAADm1hcmtldHBsYWNlX2lkAAAAAAAGAAAAAAAAAAZ2ZW5kb3IAAAAAABMAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAOtTY2hlZHVsZXMgdGhlIG5leHQgZnVuZHJhaXNpbmcgcm91bmQncyB0YXJnZXQgKDAgc3RvcHMgZnVuZHJhaXNpbmcKYWZ0ZXIgdGhlIGN1cnJlbnQgcm91bmQpOyB0aGUgbmV4dCBgcmVsZWFzZV9mdW5kcmFpc2VgLCB3aG9ldmVyIGNhbGxzCml0LCBhcHBsaWVzIGl0LiBgTm9uZWAgY2xlYXJzIGEgc2NoZWR1bGUuIE9wZXJhdG9yIG9ubHksIHdoaWxlIHRoZQpmdW5kcmFpc2VyIGlzIHN0aWxsIGNvbGxlY3RpbmcuAAAAAA9zZXRfbmV4dF90YXJnZXQAAAAAAgAAAAAAAAAObWFya2V0cGxhY2VfaWQAAAAAAAYAAAAAAAAABnRhcmdldAAAAAAD6AAAAAsAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAQAAAAAAAAAAAAAADVBhcnRpY2lwYXRpb24AAAAAAAADAAAANVB1cmNoYXNlcyB0aGlzIGFkZHJlc3MgbWFkZSBhcyBhIGJ1eWVyIGluIHRoZSBwZXJpb2QuAAAAAAAADGJ1eWVyX3ZvbHVtZQAAAAsAAAAAAAAAB2NsYWltZWQAAAAAAQAAADJTYWxlcyB0aGlzIGFkZHJlc3MgbWFkZSBhcyBhIHZlbmRvciBpbiB0aGUgcGVyaW9kLgAAAAAADXZlbmRvcl92b2x1bWUAAAAAAAAL",
        "AAAAAQAAAC9QYXlsb2FkIG9mIHRoZSBldmVudCBlbWl0dGVkIG9uIGV2ZXJ5IHB1cmNoYXNlLgAAAAAAAAAADVB1cmNoYXNlRXZlbnQAAAAAAAAHAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAABWJ1eWVyAAAAAAAAEwAAAAAAAAAQY29tbXVuaXR5X2Ftb3VudAAAAAsAAAAAAAAAD29wZXJhdG9yX2Ftb3VudAAAAAALAAAAAAAAAA9wbGF0Zm9ybV9hbW91bnQAAAAACwAAAAAAAAAGdmVuZG9yAAAAAAATAAAAAAAAAA12ZW5kb3JfYW1vdW50AAAAAAAACw==",
        "AAAAAQAAAC9SZWFkLW9ubHkgc3VtbWFyeSByZXR1cm5lZCBieSBgcmV3YXJkc19zdGF0dXNgLgAAAAAAAAAADVJld2FyZHNTdGF0dXMAAAAAAAAJAAAAAAAAAA5idXllcl9wb29sX2JwcwAAAAAABAAAAAAAAAAOY3VycmVudF9wZXJpb2QAAAAAAAQAAAAyTGVkZ2VyIHRpbWVzdGFtcCBhdCB3aGljaCB0aGlzIHZpZXcgd2FzIGV2YWx1YXRlZC4AAAAAAANub3cAAAAABgAAADhUaGUgY3VycmVudCBwZXJpb2QgY2FuIGJlIGRpc3RyaWJ1dGVkIGZyb20gdGhpcyB0aW1lIG9uLgAAAApwZXJpb2RfZW5kAAAAAAAGAAAAAAAAAA5wZXJpb2Rfc2Vjb25kcwAAAAAABgAAAAAAAAAMcGVyaW9kX3N0YXJ0AAAABgAAAAAAAAANdG90YWxfY2xhaW1lZAAAAAAAAAsAAAAAAAAAEXRvdGFsX2NvbnRyaWJ1dGVkAAAAAAAACwAAAAAAAAAPdmVuZG9yX3Bvb2xfYnBzAAAAAAQ=",
        "AAAAAQAAAElGdW5kcmFpc2luZyBydWxlcyAocmVjaXBpZW50cyBhbmQgc2hhcmVzIGZpeGVkIGF0IGNyZWF0aW9uKSBhbmQgcHJvZ3Jlc3MuAAAAAAAAAAAAAA5GdW5kcmFpc2VTdGF0ZQAAAAAACgAAAENGYWxzZSBvbmNlIGZ1bmRyYWlzaW5nIHN0b3BwZWQgKGEgcmVsZWFzZSB3aXRoIGEgbmV4dCB0YXJnZXQgb2YgMCkuAAAAAApjb2xsZWN0aW5nAAAAAAABAAAALFRydWUgb25jZSB0aGUgZmlyc3Qgcm91bmQgaGFzIGJlZW4gcmVsZWFzZWQuAAAADGdvYWxfcmVhY2hlZAAAAAEAAAAAAAAABnBvbGljeQAAAAAH0AAAAApHb2FsUG9saWN5AAAAAAArSGVsZCBieSB0aGUgY29udHJhY3QgZm9yIHRoZSBjdXJyZW50IHJvdW5kLgAAAAAGcmFpc2VkAAAAAAALAAAAQUZpeGVkIGF0IGNyZWF0aW9uOyBwYXJhbGxlbCB0byBgc2hhcmVzX2Jwc2AsIHdoaWNoIHN1bSB0byAxMF8wMDAuAAAAAAAACnJlY2lwaWVudHMAAAAAA+oAAAATAAAAQ1RoZSByb3VuZCBjdXJyZW50bHkgcmFpc2luZyAoMC1iYXNlZCk7IGluY3JlbWVudHMgb24gZXZlcnkgcmVsZWFzZS4AAAAABXJvdW5kAAAAAAAABAAAAAAAAAAKc2hhcmVzX2JwcwAAAAAD6gAAAAQAAAAbVGhlIGN1cnJlbnQgcm91bmQncyB0YXJnZXQuAAAAAAZ0YXJnZXQAAAAAAAsAAAAAAAAADHRvdGFsX3JhaXNlZAAAAAsAAAAAAAAADnRvdGFsX3JlbGVhc2VkAAAAAAAL",
        "AAAAAQAAACNSZWFkLW9ubHkgdmlldyBvZiB0aGUgcGxhdGZvcm0gZmVlLgAAAAAAAAAADlBsYXRmb3JtQ29uZmlnAAAAAAACAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAAAAAACXJlY2lwaWVudAAAAAAAABM=",
        "AAAAAAAAAgRSZWxlYXNlcyBhIGZ1bmRyYWlzaW5nIHJvdW5kIHRoYXQgcmVhY2hlZCBpdHMgdGFyZ2V0OiBwYXlzIGV2ZXJ5dGhpbmcKcmFpc2VkIGluIGl0IHRvIHRoZSByZWNpcGllbnRzIGF0IHRoZWlyIGZpeGVkIHNoYXJlcyAocm91bmRpbmcgYXMgaW4KYHNwbGl0X2J5X3NoYXJlc2ApLiBXaGF0IGZvbGxvd3MgZGVwZW5kcyBvbiBgbmV4dF90YXJnZXRgOgotIGBOb25lYCAoYW55b25lIG1heSBjYWxsKTogdGhlIHRhcmdldCB0aGUgb3BlcmF0b3Igc2NoZWR1bGVkIHdpdGgKYHNldF9uZXh0X3RhcmdldGAsIG9yIGVsc2UgdGhlIHBvbGljeSdzIGRlZmF1bHQg4oCUIGEgbmV3IHJvdW5kIHRvd2FyZAp0aGUgc2FtZSB0YXJnZXQgKE5ld1JvdW5kKSBvciBzdG9wIChTdG9wKTsKLSBgU29tZSh0KWAgKG9wZXJhdG9yIG9ubHkpOiBhIG5ldyByb3VuZCB0b3dhcmQgYHRgLCBvciBzdG9wIGlmIHQgPT0gMC4KT25jZSBzdG9wcGVkLCBsYXRlciBzYWxlcyBnaXZlIHRoZSBjb21tdW5pdHkgc2hhcmUgdG8gdGhlIHZlbmRvci4AAAARcmVsZWFzZV9mdW5kcmFpc2UAAAAAAAACAAAAAAAAAA5tYXJrZXRwbGFjZV9pZAAAAAAABgAAAAAAAAALbmV4dF90YXJnZXQAAAAD6AAAAAsAAAABAAAD6QAAAAsAAAAD",
        "AAAAAQAAAJ5XaGF0IGEgcHVyY2hhc2UgYWN0dWFsbHkgcGFpZDsgcmV0dXJuZWQgYnkgYHB1cmNoYXNlYCBhbmQgdGhlIGFtb3VudHMgb2YKaXRzIGV2ZW50LiBUaGUgY29tbXVuaXR5IGFtb3VudCBpcyAwIHdoZW4gYSBzdG9wcGVkIGZ1bmRyYWlzZXIgZ2F2ZSBpdCB0bwp0aGUgdmVuZG9yLgAAAAAAAAAAAA9QdXJjaGFzZVJlY2VpcHQAAAAABgAAAAAAAAAQY29tbXVuaXR5X2Ftb3VudAAAAAsAAAAAAAAAD29wZXJhdG9yX2Ftb3VudAAAAAALAAAAPFJld2FyZHMgbWFya2V0cGxhY2VzOiB0aGUgcGVyaW9kIHRoZSBwdXJjaGFzZSB3YXMgYm9va2VkIHRvLgAAAAZwZXJpb2QAAAAAA+gAAAAEAAAAAAAAAA9wbGF0Zm9ybV9hbW91bnQAAAAACwAAAGlGdW5kcmFpc2luZyBtYXJrZXRwbGFjZXM6IHRoZSByb3VuZCB0aGUgY29tbXVuaXR5IHNoYXJlIHdhcyBhZGRlZCB0bwooTm9uZSBvbmNlIGZ1bmRyYWlzaW5nIGhhcyBzdG9wcGVkKS4AAAAAAAAFcm91bmQAAAAAAAPoAAAABAAAAAAAAAANdmVuZG9yX2Ftb3VudAAAAAAAAAs=",
        "AAAAAAAAANVSZWdpc3RlcnMgYSBjbGFzc2ljIG1hcmtldHBsYWNlIChjb21tdW5pdHkgc2hhcmUgcGFpZCBzdHJhaWdodCB0byB0aGUKYGNvbW11bml0eV9mdW5kYCBhY2NvdW50KSBhbmQgcmV0dXJucyBpdHMgaWQuClRoZSB0aHJlZSBicHMgdmFsdWVzIG11c3Qgc3VtIHRvIGV4YWN0bHkgOV84MDA6IHRoZSByZW1haW5pbmcgMiUgaXMKQ29tcGFraSdzIGZpeGVkIHBsYXRmb3JtIGZlZS4AAAAAAAASY3JlYXRlX21hcmtldHBsYWNlAAAAAAAFAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAAAAAADmNvbW11bml0eV9mdW5kAAAAAAATAAAAAAAAAAp2ZW5kb3JfYnBzAAAAAAAEAAAAAAAAAAxvcGVyYXRvcl9icHMAAAAEAAAAAAAAAA1jb21tdW5pdHlfYnBzAAAAAAAABAAAAAEAAAPpAAAABgAAAAM=",
        "AAAAAQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAABQAAAAAAAAANY29tbXVuaXR5X2JwcwAAAAAAAAQAAACARm9yIHJld2FyZHMgYW5kIGZ1bmRyYWlzaW5nIG1hcmtldHBsYWNlcyB0aGlzIGlzIHRoZSBjb250cmFjdCdzIG93bgphZGRyZXNzOiB0aGUgY29tbXVuaXR5IHNoYXJlIHN0YXlzIGluIHRoZSBjb250cmFjdCB0cmVhc3VyeS4AAAAOY29tbXVuaXR5X2Z1bmQAAAAAABMAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAAAAAAMb3BlcmF0b3JfYnBzAAAABAAAAAAAAAAKdmVuZG9yX2JwcwAAAAAABA==",
        "AAAAAAAAAaxSZWdpc3RlcnMgYSBDb21tdW5pdHkgUmV3YXJkcyBtYXJrZXRwbGFjZTogdGhlIGNvbW11bml0eSBzaGFyZSBvZiBlYWNoCnB1cmNoYXNlIGlzIGhlbGQgYnkgdGhpcyBjb250cmFjdCBhbmQsIHBlciBwZXJpb2QgKHRoZSBmaXJzdCBvbmUKc3RhcnRzIG5vdyBhbmQgbGFzdHMgYXQgbGVhc3QgYHBlcmlvZF9zZWNvbmRzYCksIHNoYXJlZCBhbW9uZyB0aGF0CnBlcmlvZCdzIHZlbmRvcnMgKGB2ZW5kb3JfcG9vbF9icHNgIG9mIHRoZSBwb29sKSBhbmQgYnV5ZXJzICh0aGUgcmVzdCksCmluIHByb3BvcnRpb24gdG8gd2hhdCBlYWNoIG9uZSBzb2xkIG9yIGJvdWdodC4gYGNvbW11bml0eV9icHNgIG11c3QgYmUKPiAwLiBUaGUgcG9vbCBzcGxpdCBhbmQgbGVuZ3RoIGNhbiBjaGFuZ2Ugb25seSBmb3IgYSBuZXh0IHBlcmlvZCwgYXQKYGRpc3RyaWJ1dGVgLgAAABpjcmVhdGVfcmV3YXJkc19tYXJrZXRwbGFjZQAAAAAABgAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAAAAAAp2ZW5kb3JfYnBzAAAAAAAEAAAAAAAAAAxvcGVyYXRvcl9icHMAAAAEAAAAAAAAAA1jb21tdW5pdHlfYnBzAAAAAAAABAAAAAAAAAAOcGVyaW9kX3NlY29uZHMAAAAAAAYAAAAAAAAAD3ZlbmRvcl9wb29sX2JwcwAAAAAEAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAAU5SZWdpc3RlcnMgYSBmdW5kcmFpc2luZyBtYXJrZXRwbGFjZTogdGhlIGNvbW11bml0eSBzaGFyZSBvZiBlYWNoCnB1cmNoYXNlIGlzIGhlbGQgYnkgdGhpcyBjb250cmFjdCB1bnRpbCB0aGUgcm91bmQgcmVhY2hlcyBgdGFyZ2V0YCwKdGhlbiBgcmVsZWFzZV9mdW5kcmFpc2VgIHBheXMgaXQgdG8gYHJlY2lwaWVudHNgIGF0IGBzaGFyZXNfYnBzYAooc3VtbWluZyB0byAxMF8wMDApLiBgcG9saWN5YCBpcyB3aGF0IGZvbGxvd3MgYSByZWxlYXNlIGJ5IGRlZmF1bHQuClJlY2lwaWVudHMgYW5kIHNoYXJlcyBhcmUgZml4ZWQgYXQgY3JlYXRpb24gYW5kIGNhbiBuZXZlciBiZSBlZGl0ZWQuAAAAAAAcY3JlYXRlX2Z1bmRyYWlzZV9tYXJrZXRwbGFjZQAAAAgAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAAAAAAKdmVuZG9yX2JwcwAAAAAABAAAAAAAAAAMb3BlcmF0b3JfYnBzAAAABAAAAAAAAAANY29tbXVuaXR5X2JwcwAAAAAAAAQAAAAAAAAABnRhcmdldAAAAAAACwAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAABMAAAAAAAAACnNoYXJlc19icHMAAAAAA+oAAAAEAAAAAAAAAAZwb2xpY3kAAAAAB9AAAAAKR29hbFBvbGljeQAAAAAAAQAAA+kAAAAGAAAAAw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    join: this.txFromJSON<Result<void>>,
        claim: this.txFromJSON<Result<i128>>,
        upgrade: this.txFromJSON<Result<void>>,
        version: this.txFromJSON<u32>,
        purchase: this.txFromJSON<Result<PurchaseReceipt>>,
        get_admin: this.txFromJSON<Result<string>>,
        distribute: this.txFromJSON<Result<i128>>,
        get_period: this.txFromJSON<Result<PeriodTotals>>,
        get_reward: this.txFromJSON<Result<RewardView>>,
        initialize: this.txFromJSON<Result<void>>,
        get_platform: this.txFromJSON<Result<PlatformConfig>>,
        get_fundraise: this.txFromJSON<Result<FundraiseState>>,
        get_next_rules: this.txFromJSON<Result<Option<RewardsRules>>>,
        rewards_status: this.txFromJSON<Result<RewardsStatus>>,
        set_next_rules: this.txFromJSON<Result<void>>,
        get_marketplace: this.txFromJSON<Result<MarketplaceConfig>>,
        get_next_target: this.txFromJSON<Result<Option<i128>>>,
        register_vendor: this.txFromJSON<Result<void>>,
        set_next_target: this.txFromJSON<Result<void>>,
        release_fundraise: this.txFromJSON<Result<i128>>,
        create_marketplace: this.txFromJSON<Result<u64>>,
        create_rewards_marketplace: this.txFromJSON<Result<u64>>,
        create_fundraise_marketplace: this.txFromJSON<Result<u64>>
  }
}