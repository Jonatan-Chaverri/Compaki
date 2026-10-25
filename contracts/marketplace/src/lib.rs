//! Compaki marketplace contract.
//!
//! ONE deployment supports many marketplace instances, each keyed by a
//! `marketplace_id` with its own revenue-split config and vendor registry.
//! On-chain responsibilities are deliberately minimal: split config, vendor
//! registration, atomic payment splitting (vendor / operator / community plus
//! Compaki's fixed platform fee) and what happens to the community share.
//! Everything else (catalog, sessions, images) lives off-chain.
//!
//! The community share of a marketplace follows one of three modes, fixed when
//! the marketplace is created:
//! - Classic: paid straight to a community fund account with every sale.
//! - Community Rewards: held by THIS contract and shared, per period, between
//!   the period's vendors and buyers in proportion to what each one sold and
//!   bought. A period ends with `distribute`, callable by anyone once its
//!   length has passed; the operator may schedule new pool shares and a new
//!   length for the next period ahead of time (`set_next_rules`), or pass
//!   them in that same call.
//! - Fundraising: held by THIS contract until a round reaches its target,
//!   then released to recipient wallets at fixed shares. After a release a
//!   new round starts (same target, or one the operator scheduled with
//!   `set_next_target` or passes) or, with a target of 0, fundraising stops
//!   and later sales give that share to the vendor.
//!
//! The operator only has to sign while present: creating the marketplace and
//! scheduling the next rules or target. Vendors register themselves (`join`),
//! and distributions and releases need no signature, so an operator can use a
//! wallet that only signs in the browser.
//!
//! Every payment leg is a direct token transfer from the buyer to its
//! recipient inside the `purchase` call; the contract only holds tokens for
//! rewards and fundraising marketplaces.
//!
//! Treasury invariants (see README "Guarantees"):
//! - There is no withdraw function. Tokens leave the treasury only through
//!   `claim` (a participant's own reward, once per period, to that
//!   participant) and `release_fundraise` (the raised amount, to the
//!   recipients fixed at creation).
//! - A running period's or round's rules can't change; the operator can only
//!   set the next period's rules or the next round's target, which take effect
//!   at `distribute` / `release_fundraise`. Recipients and splits never change.
//! - The code is upgradeable by the admin set at `initialize` (`upgrade`), so
//!   the contract keeps its address. Stored data survives upgrades; whoever
//!   holds the admin key can change these rules with new code, which is the
//!   trust this deployment asks for (testnet only).

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env,
    Vec,
};

/// Bumped on every code change; `version` lets anyone check an upgrade landed.
pub const CONTRACT_VERSION: u32 = 6;
pub const BPS_DENOM: u32 = 10_000;
/// Compaki's platform fee on every sale (2%), paid to the platform recipient
/// fixed at `initialize`. A constant: no one can change it on this deployment.
pub const PLATFORM_FEE_BPS: u32 = 200;
/// What a marketplace's vendor / operator / community shares must add up to.
pub const MARKETPLACE_SHARE_BPS: u32 = BPS_DENOM - PLATFORM_FEE_BPS;
/// Hard cap on fundraising recipients. Keeps `release_fundraise` (one transfer
/// per recipient) well inside Soroban's per-tx limits.
pub const MAX_RECIPIENTS: u32 = 20;
/// Rewards period length bounds. The app offers 30 / 90 / 180 / 365 days;
/// one minute is the floor so demos can show a whole period quickly.
pub const MIN_PERIOD_SECONDS: u64 = 60;
pub const MAX_PERIOD_SECONDS: u64 = 366 * 24 * 60 * 60;

// Storage TTL management (ledgers close every ~5s). Every entry touched by a
// call is bumped to ~30 days when it has less than ~25 days left. Archived
// persistent entries are restored automatically when a transaction uses them.
// The contract CODE is deliberately not bumped here: its rent is large (tens
// of KB) and would land on whichever buyer's transaction crossed the
// threshold. Compaki keeps the code alive instead (deploy/upgrade scripts and
// the API scheduler extend it, paying the rent).
const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
const TTL_THRESHOLD: u32 = 25 * DAY_IN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidSplit = 3,
    MarketplaceNotFound = 4,
    VendorNotRegistered = 5,
    InvalidAmount = 6,
    /// The marketplace was not created with Community Rewards.
    RewardsNotEnabled = 7,
    /// Empty/oversized list, length mismatch, zero share, duplicate, shares
    /// not summing to 10_000, or the contract itself as a recipient.
    InvalidRecipients = 8,
    /// Period length out of bounds, or a vendor pool above 100%.
    InvalidRewardsConfig = 9,
    /// A period that has not started yet.
    PeriodNotFound = 10,
    /// `distribute` before the period's length has passed, or `claim` before
    /// the period was distributed.
    PeriodNotEnded = 11,
    /// The address did not sell or buy in that period (or its reward rounds
    /// down to zero).
    NothingToClaim = 12,
    AlreadyClaimed = 13,
    /// The marketplace was not created with a fundraising target.
    FundraiseNotEnabled = 14,
    /// `release_fundraise` while the current round is below the target.
    GoalNotReached = 15,
    /// A fundraising target of zero or less at creation, or a negative next target.
    InvalidGoal = 16,
    Overflow = 17,
    /// The contract itself as a community fund or platform recipient.
    InvalidAddress = 18,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    /// Recipient of the platform fee (set once at initialize).
    Platform,
    NextId,
    /// Marketplace config, keyed by marketplace_id.
    Config(u64),
    /// Vendor registration flag, keyed by (marketplace_id, vendor).
    Vendor(u64, Address),
    /// Community Rewards state; present only for rewards marketplaces.
    Rewards(u64),
    /// Rewards period totals, keyed by (marketplace_id, period).
    Period(u64, u32),
    /// What one address sold and bought in a period, and whether it claimed:
    /// (marketplace_id, period, address).
    Participation(u64, u32, Address),
    /// Fundraising state; present only for fundraising marketplaces.
    Fundraise(u64),
    /// Rules the operator scheduled for the next rewards period; the next
    /// `distribute` applies and removes them.
    NextRules(u64),
    /// Target the operator scheduled for the next fundraising round (0 stops
    /// fundraising); the next `release_fundraise` applies and removes it.
    NextTarget(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceConfig {
    pub operator: Address,
    /// For rewards and fundraising marketplaces this is the contract's own
    /// address: the community share stays in the contract treasury.
    pub community_fund: Address,
    pub vendor_bps: u32,
    pub operator_bps: u32,
    pub community_bps: u32,
}

/// Community Rewards state: the running period, its rules, lifetime totals.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardsState {
    /// The period purchases are booked to (0-based).
    pub current_period: u32,
    /// When the current period started; it can be distributed from
    /// period_start + period_seconds on.
    pub period_start: u64,
    pub period_seconds: u64,
    /// Part of the current period's community pool shared among its vendors;
    /// the rest (10_000 - vendor_pool_bps) is shared among its buyers.
    pub vendor_pool_bps: u32,
    pub total_contributed: i128,
    pub total_claimed: i128,
}

/// Rules for the next period, scheduled by the operator (`set_next_rules`) or
/// passed to `distribute`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardsRules {
    pub vendor_pool_bps: u32,
    pub buyer_pool_bps: u32,
    pub period_seconds: u64,
}

/// Read-only summary returned by `rewards_status`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardsStatus {
    pub current_period: u32,
    pub period_start: u64,
    /// The current period can be distributed from this time on.
    pub period_end: u64,
    pub period_seconds: u64,
    pub vendor_pool_bps: u32,
    pub buyer_pool_bps: u32,
    pub total_contributed: i128,
    pub total_claimed: i128,
    /// Ledger timestamp at which this view was evaluated.
    pub now: u64,
}

/// One period's rules, pools and the sales volume they are shared over.
/// Every purchase adds its amount to both volumes (it has one vendor and one
/// buyer).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PeriodTotals {
    pub start_ts: u64,
    /// 0 until the period is distributed.
    pub end_ts: u64,
    pub vendor_pool_bps: u32,
    pub vendor_pool: i128,
    pub buyer_pool: i128,
    pub vendor_volume: i128,
    pub buyer_volume: i128,
    pub total_claimed: i128,
    /// Rewards of a period can be claimed once it is distributed.
    pub distributed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Participation {
    /// Sales this address made as a vendor in the period.
    pub vendor_volume: i128,
    /// Purchases this address made as a buyer in the period.
    pub buyer_volume: i128,
    pub claimed: bool,
}

/// Read-only view of one address's reward for one period.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardView {
    pub vendor_volume: i128,
    pub buyer_volume: i128,
    /// Final once the period is distributed; a running estimate before that.
    pub amount: i128,
    pub period_ended: bool,
    pub claimed: bool,
}

/// The default for what follows a released round (the operator can pass a
/// different next target to `release_fundraise`).
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GoalPolicy {
    /// Fundraising ends: later sales give their community share to the vendor.
    Stop,
    /// A new round starts from zero toward the same target and recipients.
    NewRound,
}

/// Fundraising rules (recipients and shares fixed at creation) and progress.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FundraiseState {
    /// The current round's target.
    pub target: i128,
    /// Fixed at creation; parallel to `shares_bps`, which sum to 10_000.
    pub recipients: Vec<Address>,
    pub shares_bps: Vec<u32>,
    pub policy: GoalPolicy,
    /// The round currently raising (0-based); increments on every release.
    pub round: u32,
    /// Held by the contract for the current round.
    pub raised: i128,
    pub total_raised: i128,
    pub total_released: i128,
    /// True once the first round has been released.
    pub goal_reached: bool,
    /// False once fundraising stopped (a release with a next target of 0).
    pub collecting: bool,
}

/// What a purchase actually paid; returned by `purchase` and the amounts of
/// its event. The community amount is 0 when a stopped fundraiser gave it to
/// the vendor.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PurchaseReceipt {
    pub vendor_amount: i128,
    pub operator_amount: i128,
    pub community_amount: i128,
    pub platform_amount: i128,
    /// Rewards marketplaces: the period the purchase was booked to.
    pub period: Option<u32>,
    /// Fundraising marketplaces: the round the community share was added to
    /// (None once fundraising has stopped).
    pub round: Option<u32>,
}

/// Payload of the event emitted on every purchase.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PurchaseEvent {
    pub buyer: Address,
    pub vendor: Address,
    pub amount: i128,
    pub vendor_amount: i128,
    pub operator_amount: i128,
    pub community_amount: i128,
    pub platform_amount: i128,
}

/// Read-only view of the platform fee.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlatformConfig {
    pub recipient: Address,
    pub fee_bps: u32,
}

fn bump_instance(env: &Env) {
    env.deployer().extend_ttl_for_contract_instance(
        env.current_contract_address(),
        TTL_THRESHOLD,
        TTL_EXTEND_TO,
    );
}

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn load<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey) -> Option<T> {
    let value = env.storage().persistent().get(key);
    if value.is_some() {
        bump(env, key);
    }
    value
}

fn save<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey, value: &T) {
    env.storage().persistent().set(key, value);
    bump(env, key);
}

fn load_config(env: &Env, marketplace_id: u64) -> Result<MarketplaceConfig, Error> {
    load(env, &DataKey::Config(marketplace_id)).ok_or(Error::MarketplaceNotFound)
}

fn load_rewards(env: &Env, marketplace_id: u64) -> Result<RewardsState, Error> {
    load_config(env, marketplace_id)?;
    load(env, &DataKey::Rewards(marketplace_id)).ok_or(Error::RewardsNotEnabled)
}

fn load_fundraise(env: &Env, marketplace_id: u64) -> Result<FundraiseState, Error> {
    load_config(env, marketplace_id)?;
    load(env, &DataKey::Fundraise(marketplace_id)).ok_or(Error::FundraiseNotEnabled)
}

/// A period's totals; a period without any sale yet starts empty with the
/// current rules.
fn load_period(env: &Env, marketplace_id: u64, period: u32, state: &RewardsState) -> PeriodTotals {
    load(env, &DataKey::Period(marketplace_id, period)).unwrap_or(PeriodTotals {
        start_ts: state.period_start,
        end_ts: 0,
        vendor_pool_bps: state.vendor_pool_bps,
        vendor_pool: 0,
        buyer_pool: 0,
        vendor_volume: 0,
        buyer_volume: 0,
        total_claimed: 0,
        distributed: false,
    })
}

fn load_participation(env: &Env, marketplace_id: u64, period: u32, who: &Address) -> Participation {
    load(env, &DataKey::Participation(marketplace_id, period, who.clone())).unwrap_or(Participation {
        vendor_volume: 0,
        buyer_volume: 0,
        claimed: false,
    })
}

fn validate_period_seconds(period_seconds: u64) -> Result<(), Error> {
    if (MIN_PERIOD_SECONDS..=MAX_PERIOD_SECONDS).contains(&period_seconds) {
        Ok(())
    } else {
        Err(Error::InvalidRewardsConfig)
    }
}

fn validate_rules(rules: &RewardsRules) -> Result<(), Error> {
    if rules.vendor_pool_bps.checked_add(rules.buyer_pool_bps) != Some(BPS_DENOM) {
        return Err(Error::InvalidRewardsConfig);
    }
    validate_period_seconds(rules.period_seconds)
}

fn bps_of(amount: i128, bps: u32) -> Result<i128, Error> {
    Ok(amount.checked_mul(bps as i128).ok_or(Error::Overflow)? / BPS_DENOM as i128)
}

/// An address's share of a period: its fraction of the vendor volume times
/// the vendor pool plus its fraction of the buyer volume times the buyer pool.
/// Each part rounds down, so a period never pays out more than its pools;
/// the dust (under one stroop per participant) stays in the treasury.
fn reward_of(totals: &PeriodTotals, p: &Participation) -> Result<i128, Error> {
    let part = |pool: i128, mine: i128, all: i128| -> Result<i128, Error> {
        if mine == 0 || all == 0 {
            return Ok(0);
        }
        Ok(pool.checked_mul(mine).ok_or(Error::Overflow)? / all)
    };
    let vendor = part(totals.vendor_pool, p.vendor_volume, totals.vendor_volume)?;
    let buyer = part(totals.buyer_pool, p.buyer_volume, totals.buyer_volume)?;
    vendor.checked_add(buyer).ok_or(Error::Overflow)
}

/// Splits `amount` by `shares_bps`: each recipient gets the floor of its
/// share, and the r stroops left over (r < number of recipients) go one each
/// to the first r recipients. The parts sum to exactly `amount`.
fn split_by_shares(env: &Env, amount: i128, shares_bps: &Vec<u32>) -> Result<Vec<i128>, Error> {
    let mut parts: Vec<i128> = Vec::new(env);
    let mut allocated: i128 = 0;
    for share in shares_bps.iter() {
        let part = bps_of(amount, share)?;
        allocated += part;
        parts.push_back(part);
    }
    let mut remainder = amount - allocated;
    for i in 0..parts.len() {
        if remainder == 0 {
            break;
        }
        parts.set(i, parts.get_unchecked(i) + 1);
        remainder -= 1;
    }
    Ok(parts)
}

fn token_client(env: &Env) -> Result<token::Client<'_>, Error> {
    let token_addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::Token)
        .ok_or(Error::NotInitialized)?;
    Ok(token::Client::new(env, &token_addr))
}

/// The marketplace's three shares must cover exactly what the platform fee
/// leaves: vendor + operator + community == MARKETPLACE_SHARE_BPS (9_800).
fn validate_split(vendor_bps: u32, operator_bps: u32, community_bps: u32) -> Result<(), Error> {
    let sum = vendor_bps
        .checked_add(operator_bps)
        .and_then(|s| s.checked_add(community_bps))
        .ok_or(Error::InvalidSplit)?;
    if sum != MARKETPLACE_SHARE_BPS {
        return Err(Error::InvalidSplit);
    }
    Ok(())
}

fn validate_recipients(env: &Env, recipients: &Vec<Address>, shares_bps: &Vec<u32>) -> Result<(), Error> {
    let n = recipients.len();
    if n == 0 || n > MAX_RECIPIENTS || n != shares_bps.len() {
        return Err(Error::InvalidRecipients);
    }
    let contract_address = env.current_contract_address();
    let mut sum: u32 = 0;
    for i in 0..n {
        let recipient = recipients.get_unchecked(i);
        let share = shares_bps.get_unchecked(i);
        if share == 0 || recipient == contract_address {
            return Err(Error::InvalidRecipients);
        }
        for j in 0..i {
            if recipients.get_unchecked(j) == recipient {
                return Err(Error::InvalidRecipients);
            }
        }
        sum = sum.checked_add(share).ok_or(Error::InvalidRecipients)?;
    }
    if sum != BPS_DENOM {
        return Err(Error::InvalidRecipients);
    }
    Ok(())
}

/// Checks shared by the three create functions; returns nothing on success.
fn check_create(env: &Env, operator: &Address, vendor_bps: u32, operator_bps: u32, community_bps: u32) -> Result<(), Error> {
    if !env.storage().instance().has(&DataKey::Admin) {
        return Err(Error::NotInitialized);
    }
    bump_instance(env);
    operator.require_auth();
    validate_split(vendor_bps, operator_bps, community_bps)
}

/// Shared by the create functions. Caller has already authorized + validated.
fn store_marketplace(env: &Env, config: MarketplaceConfig) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextId)
        .unwrap_or(0u64);
    save(env, &DataKey::Config(id), &config);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));

    env.events().publish((symbol_short!("market"), id), config);
    id
}

#[contract]
pub struct MarketplaceContract;

#[contractimpl]
impl MarketplaceContract {
    /// One-time setup: stores the admin, the payment token (demo USD SAC) and
    /// the platform fee recipient. The admin's only privilege is `upgrade`.
    /// None of these can be changed later.
    pub fn initialize(env: Env, admin: Address, token: Address, platform: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        // Fees sent to the contract itself would be stranded.
        if platform == env.current_contract_address() {
            return Err(Error::InvalidAddress);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Platform, &platform);
        env.storage().instance().set(&DataKey::NextId, &0u64);
        bump_instance(&env);
        Ok(())
    }

    /// Registers a classic marketplace (community share paid straight to the
    /// `community_fund` account) and returns its id.
    /// The three bps values must sum to exactly 9_800: the remaining 2% is
    /// Compaki's fixed platform fee.
    pub fn create_marketplace(
        env: Env,
        operator: Address,
        community_fund: Address,
        vendor_bps: u32,
        operator_bps: u32,
        community_bps: u32,
    ) -> Result<u64, Error> {
        check_create(&env, &operator, vendor_bps, operator_bps, community_bps)?;
        // Tokens sent here outside the treasury bookkeeping would be stranded.
        if community_fund == env.current_contract_address() {
            return Err(Error::InvalidAddress);
        }

        Ok(store_marketplace(
            &env,
            MarketplaceConfig {
                operator,
                community_fund,
                vendor_bps,
                operator_bps,
                community_bps,
            },
        ))
    }

    /// Registers a Community Rewards marketplace: the community share of each
    /// purchase is held by this contract and, per period (the first one
    /// starts now and lasts at least `period_seconds`), shared among that
    /// period's vendors (`vendor_pool_bps` of the pool) and buyers (the rest),
    /// in proportion to what each one sold or bought. `community_bps` must be
    /// > 0. The pool split and length can change only for a next period, at
    /// `distribute`.
    pub fn create_rewards_marketplace(
        env: Env,
        operator: Address,
        vendor_bps: u32,
        operator_bps: u32,
        community_bps: u32,
        period_seconds: u64,
        vendor_pool_bps: u32,
    ) -> Result<u64, Error> {
        check_create(&env, &operator, vendor_bps, operator_bps, community_bps)?;
        if community_bps == 0 {
            return Err(Error::InvalidSplit);
        }
        validate_period_seconds(period_seconds)?;
        if vendor_pool_bps > BPS_DENOM {
            return Err(Error::InvalidRewardsConfig);
        }

        let id = store_marketplace(
            &env,
            MarketplaceConfig {
                operator,
                community_fund: env.current_contract_address(),
                vendor_bps,
                operator_bps,
                community_bps,
            },
        );
        let state = RewardsState {
            current_period: 0,
            period_start: env.ledger().timestamp(),
            period_seconds,
            vendor_pool_bps,
            total_contributed: 0,
            total_claimed: 0,
        };
        save(&env, &DataKey::Rewards(id), &state);
        env.events().publish((symbol_short!("rewards"), id), state);
        Ok(id)
    }

    /// Registers a fundraising marketplace: the community share of each
    /// purchase is held by this contract until the round reaches `target`,
    /// then `release_fundraise` pays it to `recipients` at `shares_bps`
    /// (summing to 10_000). `policy` is what follows a release by default.
    /// Recipients and shares are fixed at creation and can never be edited.
    #[allow(clippy::too_many_arguments)]
    pub fn create_fundraise_marketplace(
        env: Env,
        operator: Address,
        vendor_bps: u32,
        operator_bps: u32,
        community_bps: u32,
        target: i128,
        recipients: Vec<Address>,
        shares_bps: Vec<u32>,
        policy: GoalPolicy,
    ) -> Result<u64, Error> {
        check_create(&env, &operator, vendor_bps, operator_bps, community_bps)?;
        if community_bps == 0 {
            return Err(Error::InvalidSplit);
        }
        if target <= 0 {
            return Err(Error::InvalidGoal);
        }
        validate_recipients(&env, &recipients, &shares_bps)?;

        let id = store_marketplace(
            &env,
            MarketplaceConfig {
                operator,
                community_fund: env.current_contract_address(),
                vendor_bps,
                operator_bps,
                community_bps,
            },
        );
        let state = FundraiseState {
            target,
            recipients,
            shares_bps,
            policy,
            round: 0,
            raised: 0,
            total_raised: 0,
            total_released: 0,
            goal_reached: false,
            collecting: true,
        };
        save(&env, &DataKey::Fundraise(id), &state);
        env.events().publish((symbol_short!("fundrais"), id), state);
        Ok(id)
    }

    /// Registers a vendor in a marketplace. Only the marketplace's operator
    /// may call this.
    pub fn register_vendor(env: Env, marketplace_id: u64, vendor: Address) -> Result<(), Error> {
        bump_instance(&env);
        let config = load_config(&env, marketplace_id)?;
        config.operator.require_auth();

        save(&env, &DataKey::Vendor(marketplace_id, vendor.clone()), &true);

        env.events()
            .publish((symbol_short!("vendor"), marketplace_id), vendor);
        Ok(())
    }

    /// Registers the caller as a vendor of a marketplace, with the vendor's
    /// own signature (the app's open invite link), so the operator doesn't
    /// have to be online to approve each one. Same effect as
    /// `register_vendor`; registering twice is harmless.
    pub fn join(env: Env, marketplace_id: u64, vendor: Address) -> Result<(), Error> {
        bump_instance(&env);
        load_config(&env, marketplace_id)?;
        vendor.require_auth();

        save(&env, &DataKey::Vendor(marketplace_id, vendor.clone()), &true);

        env.events()
            .publish((symbol_short!("vendor"), marketplace_id), vendor);
        Ok(())
    }

    /// Executes a purchase: atomically moves `amount` of the payment token
    /// from the buyer to vendor / operator / community according to the
    /// marketplace's split, plus the 2% platform fee to the platform
    /// recipient — each leg a direct transfer from the buyer. The rounding
    /// remainder always goes to the community share so no dust is ever lost.
    ///
    /// Community share by mode:
    /// - classic: to the community fund account;
    /// - rewards: to this contract, booked to the current period together
    ///   with the vendor's and buyer's volume (until `distribute` closes it);
    /// - fundraising: to this contract for the current round; once
    ///   fundraising has stopped it goes to the vendor instead.
    pub fn purchase(
        env: Env,
        marketplace_id: u64,
        buyer: Address,
        vendor: Address,
        amount: i128,
    ) -> Result<PurchaseReceipt, Error> {
        bump_instance(&env);
        buyer.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let config = load_config(&env, marketplace_id)?;
        let registered: bool =
            load(&env, &DataKey::Vendor(marketplace_id, vendor.clone())).unwrap_or(false);
        if !registered {
            return Err(Error::VendorNotRegistered);
        }

        let client = token_client(&env)?;
        let platform: Address = env
            .storage()
            .instance()
            .get(&DataKey::Platform)
            .ok_or(Error::NotInitialized)?;

        // Integer split; vendor, operator and platform shares round down, the
        // remainder (including all rounding dust) goes to the community.
        let platform_amount = bps_of(amount, PLATFORM_FEE_BPS)?;
        let mut vendor_amount = bps_of(amount, config.vendor_bps)?;
        let operator_amount = bps_of(amount, config.operator_bps)?;
        let mut community_amount = amount - vendor_amount - operator_amount - platform_amount;

        // Treasury bookkeeping is resolved before any transfer; every leg and
        // the accounting update happen inside this single invocation.
        let mut period = None;
        let mut round = None;
        if let Some(mut state) = load::<RewardsState>(&env, &DataKey::Rewards(marketplace_id)) {
            let k = state.current_period;
            let mut totals = load_period(&env, marketplace_id, k, &state);
            let vendor_part = bps_of(community_amount, totals.vendor_pool_bps)?;
            totals.vendor_pool += vendor_part;
            totals.buyer_pool += community_amount - vendor_part;
            totals.vendor_volume = totals.vendor_volume.checked_add(amount).ok_or(Error::Overflow)?;
            totals.buyer_volume = totals.buyer_volume.checked_add(amount).ok_or(Error::Overflow)?;
            save(&env, &DataKey::Period(marketplace_id, k), &totals);

            // The vendor and the buyer may be the same address.
            let mut seller = load_participation(&env, marketplace_id, k, &vendor);
            seller.vendor_volume = seller.vendor_volume.checked_add(amount).ok_or(Error::Overflow)?;
            if buyer == vendor {
                seller.buyer_volume = seller.buyer_volume.checked_add(amount).ok_or(Error::Overflow)?;
            } else {
                let mut shopper = load_participation(&env, marketplace_id, k, &buyer);
                shopper.buyer_volume = shopper.buyer_volume.checked_add(amount).ok_or(Error::Overflow)?;
                save(&env, &DataKey::Participation(marketplace_id, k, buyer.clone()), &shopper);
            }
            save(&env, &DataKey::Participation(marketplace_id, k, vendor.clone()), &seller);

            state.total_contributed = state
                .total_contributed
                .checked_add(community_amount)
                .ok_or(Error::Overflow)?;
            save(&env, &DataKey::Rewards(marketplace_id), &state);
            period = Some(k);
        } else if let Some(mut state) = load::<FundraiseState>(&env, &DataKey::Fundraise(marketplace_id)) {
            if state.collecting {
                state.raised = state.raised.checked_add(community_amount).ok_or(Error::Overflow)?;
                state.total_raised = state
                    .total_raised
                    .checked_add(community_amount)
                    .ok_or(Error::Overflow)?;
                save(&env, &DataKey::Fundraise(marketplace_id), &state);
                round = Some(state.round);
            } else {
                // Fundraising stopped: the vendor keeps that share.
                vendor_amount += community_amount;
                community_amount = 0;
            }
        }

        if vendor_amount > 0 {
            client.transfer(&buyer, &vendor, &vendor_amount);
        }
        if operator_amount > 0 {
            client.transfer(&buyer, &config.operator, &operator_amount);
        }
        if community_amount > 0 {
            // For rewards / fundraising marketplaces community_fund is this contract.
            client.transfer(&buyer, &config.community_fund, &community_amount);
        }
        if platform_amount > 0 {
            client.transfer(&buyer, &platform, &platform_amount);
        }

        env.events().publish(
            (symbol_short!("purchase"), marketplace_id),
            PurchaseEvent {
                buyer,
                vendor,
                amount,
                vendor_amount,
                operator_amount,
                community_amount,
                platform_amount,
            },
        );
        Ok(PurchaseReceipt {
            vendor_amount,
            operator_amount,
            community_amount,
            platform_amount,
            period,
            round,
        })
    }

    /// Ends the current rewards period once its length has passed: its pools
    /// become claimable and a new period starts now. Anyone may call it with
    /// `next = None`, so nobody can hold the rewards back: the next period
    /// uses the rules the operator scheduled with `set_next_rules`, or the
    /// same ones. Passing `Some(rules)` sets the next period's pool shares and
    /// length directly and requires the operator's authorization. The API
    /// calls it right when the period is due. Returns the distributed pool
    /// total.
    pub fn distribute(env: Env, marketplace_id: u64, next: Option<RewardsRules>) -> Result<i128, Error> {
        bump_instance(&env);
        let config = load_config(&env, marketplace_id)?;
        let mut state = load_rewards(&env, marketplace_id)?;
        let now = env.ledger().timestamp();
        if now < state.period_start.saturating_add(state.period_seconds) {
            return Err(Error::PeriodNotEnded);
        }
        if let Some(rules) = &next {
            config.operator.require_auth();
            validate_rules(rules)?;
        }
        // Scheduled rules are used up by this distribution either way.
        let scheduled_key = DataKey::NextRules(marketplace_id);
        let scheduled: Option<RewardsRules> = env.storage().persistent().get(&scheduled_key);
        if scheduled.is_some() {
            env.storage().persistent().remove(&scheduled_key);
        }
        let next = next.or(scheduled);

        let k = state.current_period;
        let mut totals = load_period(&env, marketplace_id, k, &state);
        totals.end_ts = now;
        totals.distributed = true;
        save(&env, &DataKey::Period(marketplace_id, k), &totals);

        state.current_period = k + 1;
        state.period_start = now;
        if let Some(rules) = next {
            state.vendor_pool_bps = rules.vendor_pool_bps;
            state.period_seconds = rules.period_seconds;
        }
        save(&env, &DataKey::Rewards(marketplace_id), &state);

        let pool = totals.vendor_pool + totals.buyer_pool;
        env.events().publish(
            (symbol_short!("distrib"), marketplace_id, k),
            (pool, state.vendor_pool_bps, state.period_seconds),
        );
        Ok(pool)
    }

    /// Schedules the rules of the next rewards period (pool shares and
    /// length); the next `distribute`, whoever calls it, applies them. `None`
    /// clears a schedule. Operator only. The running period is unaffected.
    pub fn set_next_rules(env: Env, marketplace_id: u64, rules: Option<RewardsRules>) -> Result<(), Error> {
        bump_instance(&env);
        let config = load_config(&env, marketplace_id)?;
        load_rewards(&env, marketplace_id)?;
        config.operator.require_auth();
        let key = DataKey::NextRules(marketplace_id);
        match &rules {
            Some(r) => {
                validate_rules(r)?;
                save(&env, &key, r);
            }
            None => env.storage().persistent().remove(&key),
        }
        env.events().publish((symbol_short!("nxtrules"), marketplace_id), rules);
        Ok(())
    }

    /// Pays `member` their reward for a distributed period: their share of
    /// the vendor pool (by sales) plus their share of the buyer pool (by
    /// purchases). Requires the member's own authorization; the payout always
    /// goes to `member`, once.
    pub fn claim(env: Env, marketplace_id: u64, period: u32, member: Address) -> Result<i128, Error> {
        bump_instance(&env);
        member.require_auth();
        let mut state = load_rewards(&env, marketplace_id)?;
        if period > state.current_period {
            return Err(Error::PeriodNotFound);
        }
        let mut totals = load_period(&env, marketplace_id, period, &state);
        if !totals.distributed {
            return Err(Error::PeriodNotEnded);
        }
        let key = DataKey::Participation(marketplace_id, period, member.clone());
        let mut participation: Participation = load(&env, &key).ok_or(Error::NothingToClaim)?;
        if participation.claimed {
            return Err(Error::AlreadyClaimed);
        }
        let amount = reward_of(&totals, &participation)?;
        if amount <= 0 {
            return Err(Error::NothingToClaim);
        }

        totals.total_claimed = totals.total_claimed.checked_add(amount).ok_or(Error::Overflow)?;
        // Defence in depth: rewards round down so they can never exceed the
        // pools; this can only trip on a bug.
        if totals.total_claimed > totals.vendor_pool + totals.buyer_pool {
            return Err(Error::Overflow);
        }
        state.total_claimed = state.total_claimed.checked_add(amount).ok_or(Error::Overflow)?;
        participation.claimed = true;
        save(&env, &key, &participation);
        save(&env, &DataKey::Period(marketplace_id, period), &totals);
        save(&env, &DataKey::Rewards(marketplace_id), &state);

        token_client(&env)?.transfer(&env.current_contract_address(), &member, &amount);

        env.events().publish(
            (symbol_short!("claim"), marketplace_id, period),
            (member, amount),
        );
        Ok(amount)
    }

    /// Releases a fundraising round that reached its target: pays everything
    /// raised in it to the recipients at their fixed shares (rounding as in
    /// `split_by_shares`). What follows depends on `next_target`:
    /// - `None` (anyone may call): the target the operator scheduled with
    ///   `set_next_target`, or else the policy's default — a new round toward
    ///   the same target (NewRound) or stop (Stop);
    /// - `Some(t)` (operator only): a new round toward `t`, or stop if t == 0.
    /// Once stopped, later sales give the community share to the vendor.
    pub fn release_fundraise(env: Env, marketplace_id: u64, next_target: Option<i128>) -> Result<i128, Error> {
        bump_instance(&env);
        let config = load_config(&env, marketplace_id)?;
        let mut state = load_fundraise(&env, marketplace_id)?;
        if !state.collecting || state.raised < state.target || state.raised <= 0 {
            return Err(Error::GoalNotReached);
        }
        if let Some(target) = next_target {
            config.operator.require_auth();
            if target < 0 {
                return Err(Error::InvalidGoal);
            }
        }
        // A scheduled target is used up by this release either way.
        let scheduled_key = DataKey::NextTarget(marketplace_id);
        let scheduled: Option<i128> = env.storage().persistent().get(&scheduled_key);
        if scheduled.is_some() {
            env.storage().persistent().remove(&scheduled_key);
        }
        let next = match next_target.or(scheduled) {
            Some(target) => target,
            None => match state.policy {
                GoalPolicy::Stop => 0,
                GoalPolicy::NewRound => state.target,
            },
        };

        let amount = state.raised;
        let parts = split_by_shares(&env, amount, &state.shares_bps)?;
        let released_round = state.round;
        state.raised = 0;
        state.round += 1;
        state.total_released = state.total_released.checked_add(amount).ok_or(Error::Overflow)?;
        state.goal_reached = true;
        if next == 0 {
            state.collecting = false;
        } else {
            state.target = next;
        }
        save(&env, &DataKey::Fundraise(marketplace_id), &state);

        let client = token_client(&env)?;
        let contract_address = env.current_contract_address();
        for i in 0..state.recipients.len() {
            let part = parts.get_unchecked(i);
            if part > 0 {
                client.transfer(&contract_address, &state.recipients.get_unchecked(i), &part);
            }
        }

        env.events().publish(
            (symbol_short!("release"), marketplace_id, released_round),
            (amount, next),
        );
        Ok(amount)
    }

    /// Schedules the next fundraising round's target (0 stops fundraising
    /// after the current round); the next `release_fundraise`, whoever calls
    /// it, applies it. `None` clears a schedule. Operator only, while the
    /// fundraiser is still collecting.
    pub fn set_next_target(env: Env, marketplace_id: u64, target: Option<i128>) -> Result<(), Error> {
        bump_instance(&env);
        let config = load_config(&env, marketplace_id)?;
        let state = load_fundraise(&env, marketplace_id)?;
        config.operator.require_auth();
        if !state.collecting {
            return Err(Error::InvalidGoal);
        }
        let key = DataKey::NextTarget(marketplace_id);
        match target {
            Some(t) if t < 0 => return Err(Error::InvalidGoal),
            Some(t) => save(&env, &key, &t),
            None => env.storage().persistent().remove(&key),
        }
        env.events().publish((symbol_short!("nxttarg"), marketplace_id), target);
        Ok(())
    }

    /// Replaces this contract's code with an uploaded wasm (by hash), keeping
    /// its address and all stored data. Only the admin set at `initialize`.
    /// New code must read the stored types as they are (add fields as new
    /// storage keys rather than changing existing structs).
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        bump_instance(&env);
        env.events().publish((symbol_short!("upgrade"),), new_wasm_hash.clone());
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    /// The code version (CONTRACT_VERSION), to confirm an upgrade.
    pub fn version(_env: Env) -> u32 {
        CONTRACT_VERSION
    }

    /// The admin allowed to `upgrade`.
    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)
    }

    /// The platform fee: its recipient and rate (fixed for this deployment).
    pub fn get_platform(env: Env) -> Result<PlatformConfig, Error> {
        let recipient: Address = env
            .storage()
            .instance()
            .get(&DataKey::Platform)
            .ok_or(Error::NotInitialized)?;
        Ok(PlatformConfig { recipient, fee_bps: PLATFORM_FEE_BPS })
    }

    /// Read-only accessor for a marketplace's split config.
    pub fn get_marketplace(env: Env, marketplace_id: u64) -> Result<MarketplaceConfig, Error> {
        load_config(&env, marketplace_id)
    }

    /// Rules, current period and lifetime totals of a rewards marketplace,
    /// plus the ledger time the view was evaluated at.
    pub fn rewards_status(env: Env, marketplace_id: u64) -> Result<RewardsStatus, Error> {
        let state = load_rewards(&env, marketplace_id)?;
        Ok(RewardsStatus {
            current_period: state.current_period,
            period_start: state.period_start,
            period_end: state.period_start.saturating_add(state.period_seconds),
            period_seconds: state.period_seconds,
            vendor_pool_bps: state.vendor_pool_bps,
            buyer_pool_bps: BPS_DENOM - state.vendor_pool_bps,
            total_contributed: state.total_contributed,
            total_claimed: state.total_claimed,
            now: env.ledger().timestamp(),
        })
    }

    /// A period's rules, pools and volumes (empty for a period without sales).
    pub fn get_period(env: Env, marketplace_id: u64, period: u32) -> Result<PeriodTotals, Error> {
        let state = load_rewards(&env, marketplace_id)?;
        if period > state.current_period {
            return Err(Error::PeriodNotFound);
        }
        Ok(load_period(&env, marketplace_id, period, &state))
    }

    /// One address's reward for a period: final once the period is
    /// distributed, a running estimate while it is still current.
    pub fn get_reward(env: Env, marketplace_id: u64, period: u32, member: Address) -> Result<RewardView, Error> {
        let state = load_rewards(&env, marketplace_id)?;
        if period > state.current_period {
            return Err(Error::PeriodNotFound);
        }
        let participation = load_participation(&env, marketplace_id, period, &member);
        let totals = load_period(&env, marketplace_id, period, &state);
        Ok(RewardView {
            vendor_volume: participation.vendor_volume,
            buyer_volume: participation.buyer_volume,
            amount: reward_of(&totals, &participation)?,
            period_ended: totals.distributed,
            claimed: participation.claimed,
        })
    }

    /// Rules and progress of a fundraising marketplace.
    pub fn get_fundraise(env: Env, marketplace_id: u64) -> Result<FundraiseState, Error> {
        load_fundraise(&env, marketplace_id)
    }

    /// The rules scheduled for the next rewards period, if any.
    pub fn get_next_rules(env: Env, marketplace_id: u64) -> Result<Option<RewardsRules>, Error> {
        load_rewards(&env, marketplace_id)?;
        Ok(load(&env, &DataKey::NextRules(marketplace_id)))
    }

    /// The target scheduled for the next fundraising round, if any.
    pub fn get_next_target(env: Env, marketplace_id: u64) -> Result<Option<i128>, Error> {
        load_fundraise(&env, marketplace_id)?;
        Ok(load(&env, &DataKey::NextTarget(marketplace_id)))
    }
}

#[cfg(test)]
mod test;
