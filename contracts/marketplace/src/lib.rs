//! Compaki marketplace contract.
//!
//! ONE deployment supports many marketplace instances, each keyed by a
//! `marketplace_id` with its own revenue-split config and vendor registry.
//! On-chain responsibilities are deliberately minimal: split config, vendor
//! registration, atomic 3-way payment splitting and — for marketplaces created
//! with Community Rewards — a protected community treasury distributed to
//! registered members per period. Everything else (catalog, sessions, images)
//! lives off-chain.
//!
//! Community Rewards invariants (see README "Guarantees"):
//! - The community share of a rewards marketplace is held by THIS contract and
//!   booked to exactly one (marketplace, period). There is no admin, withdraw
//!   or upgrade function: the only way tokens leave the treasury is `claim`,
//!   which pays a registered member their own, fixed entitlement once.
//! - A period's beneficiaries and shares are fixed when it opens (before any
//!   contribution) and can never be edited. A new period can only be opened
//!   once the previous one has ended.
//! - A purchase on a rewards marketplace with no active period is rejected
//!   (atomically) instead of routing the community share elsewhere.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Vec,
};

pub const BPS_DENOM: u32 = 10_000;
/// Hard cap on beneficiaries per period. Keeps `close_period` (which writes one
/// entitlement per member) well inside Soroban's per-transaction limits.
pub const MAX_BENEFICIARIES: u32 = 20;
/// Longest allowed period. Prevents funds being locked for an unbounded time
/// by a far-future end date.
pub const MAX_PERIOD_SECONDS: u64 = 366 * 24 * 60 * 60;

// Storage TTL management (ledgers close every ~5s). Every entry touched by a
// call is bumped to ~30 days when it has less than ~25 days left. Archived
// persistent entries are restorable, never deleted, but bumping keeps the
// normal flows from needing a restore.
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
    /// not summing to 10_000, or a forbidden address (operator / contract).
    InvalidBeneficiaries = 8,
    /// Rewards marketplace purchase while no period is accepting contributions.
    NoActivePeriod = 9,
    PeriodNotFound = 10,
    /// `close_period` before the period's end timestamp.
    PeriodNotEnded = 11,
    PeriodAlreadyClosed = 12,
    /// `claim` / entitlement lookup on a period that is not closed yet.
    PeriodNotClosed = 13,
    NotBeneficiary = 14,
    AlreadyClaimed = 15,
    NothingToClaim = 16,
    /// `open_period` while the latest period is still running.
    PeriodActive = 17,
    InvalidPeriodEnd = 18,
    Overflow = 19,
    /// The community fund of a classic marketplace cannot be this contract.
    InvalidAddress = 20,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    NextId,
    /// Marketplace config, keyed by marketplace_id.
    Config(u64),
    /// Vendor registration flag, keyed by (marketplace_id, vendor).
    Vendor(u64, Address),
    /// Community Rewards state; present only for rewards marketplaces.
    Rewards(u64),
    /// Period, keyed by (marketplace_id, period_id).
    Period(u64, u32),
    /// Member entitlement, written at close: (marketplace_id, period_id, member).
    Entitlement(u64, u32, Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceConfig {
    pub operator: Address,
    /// For rewards marketplaces this is the contract's own address: the
    /// community share stays in the contract treasury.
    pub community_fund: Address,
    pub vendor_bps: u32,
    pub operator_bps: u32,
    pub community_bps: u32,
}

/// Per-marketplace treasury bookkeeping.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardsState {
    /// Number of periods ever opened; ids are 0..period_count.
    pub period_count: u32,
    /// Lifetime community contributions received by this marketplace.
    pub total_contributed: i128,
    /// Lifetime rewards paid out to members of this marketplace.
    pub total_claimed: i128,
}

/// Read-only summary returned by `rewards_status`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardsStatus {
    pub period_count: u32,
    pub total_contributed: i128,
    pub total_claimed: i128,
    /// Ledger timestamp at which this view was evaluated.
    pub now: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Period {
    /// Contributions are accepted while start_ts <= ledger time < end_ts.
    pub start_ts: u64,
    pub end_ts: u64,
    /// Fixed at open; parallel to `shares_bps`.
    pub beneficiaries: Vec<Address>,
    pub shares_bps: Vec<u32>,
    pub total_contributed: i128,
    pub total_claimed: i128,
    pub closed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Entitlement {
    pub member: Address,
    pub share_bps: u32,
    /// Final amount, computed once at close.
    pub amount: i128,
    pub claimed: bool,
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
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn load_config(env: &Env, marketplace_id: u64) -> Result<MarketplaceConfig, Error> {
    let key = DataKey::Config(marketplace_id);
    let config = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::MarketplaceNotFound)?;
    bump(env, &key);
    Ok(config)
}

fn load_rewards(env: &Env, marketplace_id: u64) -> Result<RewardsState, Error> {
    load_config(env, marketplace_id)?;
    let key = DataKey::Rewards(marketplace_id);
    let state = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::RewardsNotEnabled)?;
    bump(env, &key);
    Ok(state)
}

fn save_rewards(env: &Env, marketplace_id: u64, state: &RewardsState) {
    let key = DataKey::Rewards(marketplace_id);
    env.storage().persistent().set(&key, state);
    bump(env, &key);
}

fn load_period(env: &Env, marketplace_id: u64, period_id: u32) -> Result<Period, Error> {
    let key = DataKey::Period(marketplace_id, period_id);
    let period = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::PeriodNotFound)?;
    bump(env, &key);
    Ok(period)
}

fn save_period(env: &Env, marketplace_id: u64, period_id: u32, period: &Period) {
    let key = DataKey::Period(marketplace_id, period_id);
    env.storage().persistent().set(&key, period);
    bump(env, &key);
}

fn token_client(env: &Env) -> Result<token::Client<'_>, Error> {
    let token_addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::Token)
        .ok_or(Error::NotInitialized)?;
    Ok(token::Client::new(env, &token_addr))
}

fn validate_split(vendor_bps: u32, operator_bps: u32, community_bps: u32) -> Result<(), Error> {
    let sum = vendor_bps
        .checked_add(operator_bps)
        .and_then(|s| s.checked_add(community_bps))
        .ok_or(Error::InvalidSplit)?;
    if sum != BPS_DENOM {
        return Err(Error::InvalidSplit);
    }
    Ok(())
}

/// Shared by both create functions. Caller has already authorized + validated.
fn store_marketplace(env: &Env, config: MarketplaceConfig) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextId)
        .unwrap_or(0u64);
    let key = DataKey::Config(id);
    env.storage().persistent().set(&key, &config);
    bump(env, &key);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));

    env.events().publish((symbol_short!("market"), id), config);
    id
}

#[contract]
pub struct MarketplaceContract;

#[contractimpl]
impl MarketplaceContract {
    /// One-time setup: stores the admin and the payment token (demo USD SAC).
    /// The admin has no privileged functions; it is recorded for provenance.
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &0u64);
        bump_instance(&env);
        Ok(())
    }

    /// Registers a classic marketplace (community share paid straight to the
    /// `community_fund` account) and returns its id.
    /// The three bps values must sum to exactly 10_000.
    pub fn create_marketplace(
        env: Env,
        operator: Address,
        community_fund: Address,
        vendor_bps: u32,
        operator_bps: u32,
        community_bps: u32,
    ) -> Result<u64, Error> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NotInitialized);
        }
        bump_instance(&env);
        operator.require_auth();
        validate_split(vendor_bps, operator_bps, community_bps)?;
        // Tokens sent here outside the rewards bookkeeping would be stranded.
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
    /// purchase is held by this contract and distributed per period.
    /// `community_bps` must be > 0. The mode is fixed at creation.
    pub fn create_rewards_marketplace(
        env: Env,
        operator: Address,
        vendor_bps: u32,
        operator_bps: u32,
        community_bps: u32,
    ) -> Result<u64, Error> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NotInitialized);
        }
        bump_instance(&env);
        operator.require_auth();
        validate_split(vendor_bps, operator_bps, community_bps)?;
        if community_bps == 0 {
            return Err(Error::InvalidSplit);
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
        save_rewards(
            &env,
            id,
            &RewardsState {
                period_count: 0,
                total_contributed: 0,
                total_claimed: 0,
            },
        );
        Ok(id)
    }

    /// Registers a vendor in a marketplace. Only the marketplace's operator
    /// may call this.
    pub fn register_vendor(env: Env, marketplace_id: u64, vendor: Address) -> Result<(), Error> {
        bump_instance(&env);
        let config = load_config(&env, marketplace_id)?;
        config.operator.require_auth();

        let key = DataKey::Vendor(marketplace_id, vendor.clone());
        env.storage().persistent().set(&key, &true);
        bump(&env, &key);

        env.events()
            .publish((symbol_short!("vendor"), marketplace_id), vendor);
        Ok(())
    }

    /// Executes a purchase: atomically moves `amount` of the payment token
    /// from the buyer to vendor / operator / community according to the
    /// marketplace's split. The rounding remainder always goes to the
    /// community share so no dust is ever lost.
    ///
    /// Rewards marketplaces: the community share is transferred to this
    /// contract and booked to the active period, whose id is returned. With no
    /// active period the whole purchase fails with `NoActivePeriod`.
    /// Classic marketplaces return `None`.
    pub fn purchase(
        env: Env,
        marketplace_id: u64,
        buyer: Address,
        vendor: Address,
        amount: i128,
    ) -> Result<Option<u32>, Error> {
        bump_instance(&env);
        buyer.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let config = load_config(&env, marketplace_id)?;
        let vendor_key = DataKey::Vendor(marketplace_id, vendor.clone());
        let registered: bool = env
            .storage()
            .persistent()
            .get(&vendor_key)
            .unwrap_or(false);
        if !registered {
            return Err(Error::VendorNotRegistered);
        }
        bump(&env, &vendor_key);

        let client = token_client(&env)?;

        // Integer split; both shares round down, remainder → community.
        let vendor_amount = amount
            .checked_mul(config.vendor_bps as i128)
            .ok_or(Error::Overflow)?
            / BPS_DENOM as i128;
        let operator_amount = amount
            .checked_mul(config.operator_bps as i128)
            .ok_or(Error::Overflow)?
            / BPS_DENOM as i128;
        let community_amount = amount - vendor_amount - operator_amount;

        // Rewards bookkeeping is resolved before any transfer; every leg and
        // the accounting update happen inside this single invocation.
        let rewards_period = match env
            .storage()
            .persistent()
            .get::<_, RewardsState>(&DataKey::Rewards(marketplace_id))
        {
            None => None,
            Some(mut state) => {
                if state.period_count == 0 {
                    return Err(Error::NoActivePeriod);
                }
                let period_id = state.period_count - 1;
                let mut period = load_period(&env, marketplace_id, period_id)?;
                let now = env.ledger().timestamp();
                if period.closed || now < period.start_ts || now >= period.end_ts {
                    return Err(Error::NoActivePeriod);
                }
                period.total_contributed = period
                    .total_contributed
                    .checked_add(community_amount)
                    .ok_or(Error::Overflow)?;
                state.total_contributed = state
                    .total_contributed
                    .checked_add(community_amount)
                    .ok_or(Error::Overflow)?;
                save_period(&env, marketplace_id, period_id, &period);
                save_rewards(&env, marketplace_id, &state);
                Some(period_id)
            }
        };

        if vendor_amount > 0 {
            client.transfer(&buyer, &vendor, &vendor_amount);
        }
        if operator_amount > 0 {
            client.transfer(&buyer, &config.operator, &operator_amount);
        }
        if community_amount > 0 {
            // For rewards marketplaces community_fund is this contract.
            client.transfer(&buyer, &config.community_fund, &community_amount);
        }

        if let Some(period_id) = rewards_period {
            env.events().publish(
                (symbol_short!("contrib"), marketplace_id, period_id),
                community_amount,
            );
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
            },
        );
        Ok(rewards_period)
    }

    /// Opens the next rewards period, starting now and ending at `end_ts`
    /// (ledger timestamp, seconds). Only the marketplace operator may call it,
    /// and only once the previous period has ended. Beneficiaries and shares
    /// are frozen here and can never be edited.
    pub fn open_period(
        env: Env,
        marketplace_id: u64,
        beneficiaries: Vec<Address>,
        shares_bps: Vec<u32>,
        end_ts: u64,
    ) -> Result<u32, Error> {
        bump_instance(&env);
        let config = load_config(&env, marketplace_id)?;
        let mut state = load_rewards(&env, marketplace_id)?;
        config.operator.require_auth();

        let n = beneficiaries.len();
        if n == 0 || n > MAX_BENEFICIARIES || n != shares_bps.len() {
            return Err(Error::InvalidBeneficiaries);
        }
        let contract_address = env.current_contract_address();
        let mut sum: u32 = 0;
        for i in 0..n {
            let member = beneficiaries.get_unchecked(i);
            let share = shares_bps.get_unchecked(i);
            if share == 0 || member == config.operator || member == contract_address {
                return Err(Error::InvalidBeneficiaries);
            }
            for j in 0..i {
                if beneficiaries.get_unchecked(j) == member {
                    return Err(Error::InvalidBeneficiaries);
                }
            }
            sum = sum.checked_add(share).ok_or(Error::InvalidBeneficiaries)?;
        }
        if sum != BPS_DENOM {
            return Err(Error::InvalidBeneficiaries);
        }

        let now = env.ledger().timestamp();
        if state.period_count > 0 {
            let last = load_period(&env, marketplace_id, state.period_count - 1)?;
            if now < last.end_ts {
                return Err(Error::PeriodActive);
            }
        }
        if end_ts <= now || end_ts - now > MAX_PERIOD_SECONDS {
            return Err(Error::InvalidPeriodEnd);
        }

        let period_id = state.period_count;
        let period = Period {
            start_ts: now,
            end_ts,
            beneficiaries,
            shares_bps,
            total_contributed: 0,
            total_claimed: 0,
            closed: false,
        };
        save_period(&env, marketplace_id, period_id, &period);
        state.period_count = period_id + 1;
        save_rewards(&env, marketplace_id, &state);

        env.events().publish(
            (symbol_short!("p_open"), marketplace_id, period_id),
            period,
        );
        Ok(period_id)
    }

    /// Closes an ended period and fixes every member's entitlement. Anyone may
    /// call it once ledger time >= end_ts, so the operator cannot hold
    /// members' rewards hostage by never closing.
    ///
    /// Rounding: each member gets floor(total * share / 10_000); the r stroops
    /// left over (r < number of members) go one each to the first r members in
    /// registration order. The entitlements sum to exactly the period total.
    pub fn close_period(env: Env, marketplace_id: u64, period_id: u32) -> Result<i128, Error> {
        bump_instance(&env);
        load_rewards(&env, marketplace_id)?;
        let mut period = load_period(&env, marketplace_id, period_id)?;
        if period.closed {
            return Err(Error::PeriodAlreadyClosed);
        }
        if env.ledger().timestamp() < period.end_ts {
            return Err(Error::PeriodNotEnded);
        }

        let total = period.total_contributed;
        let n = period.beneficiaries.len();
        let mut amounts: Vec<i128> = Vec::new(&env);
        let mut allocated: i128 = 0;
        for i in 0..n {
            let share = period.shares_bps.get_unchecked(i) as i128;
            let amount = total.checked_mul(share).ok_or(Error::Overflow)? / BPS_DENOM as i128;
            allocated += amount;
            amounts.push_back(amount);
        }
        let mut remainder = total - allocated;
        for i in 0..n {
            let member = period.beneficiaries.get_unchecked(i);
            let mut amount = amounts.get_unchecked(i);
            if remainder > 0 {
                amount += 1;
                remainder -= 1;
            }
            let key = DataKey::Entitlement(marketplace_id, period_id, member.clone());
            env.storage().persistent().set(
                &key,
                &Entitlement {
                    member,
                    share_bps: period.shares_bps.get_unchecked(i),
                    amount,
                    claimed: false,
                },
            );
            bump(&env, &key);
        }

        period.closed = true;
        save_period(&env, marketplace_id, period_id, &period);
        env.events().publish(
            (symbol_short!("p_close"), marketplace_id, period_id),
            total,
        );
        Ok(total)
    }

    /// Pays `member` their entitlement for a closed period. Requires the
    /// member's own authorization; the payout always goes to `member`.
    pub fn claim(
        env: Env,
        marketplace_id: u64,
        period_id: u32,
        member: Address,
    ) -> Result<i128, Error> {
        bump_instance(&env);
        member.require_auth();
        let mut state = load_rewards(&env, marketplace_id)?;
        let mut period = load_period(&env, marketplace_id, period_id)?;
        if !period.closed {
            return Err(Error::PeriodNotClosed);
        }
        let key = DataKey::Entitlement(marketplace_id, period_id, member.clone());
        let mut entitlement: Entitlement = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotBeneficiary)?;
        if entitlement.claimed {
            return Err(Error::AlreadyClaimed);
        }
        if entitlement.amount <= 0 {
            return Err(Error::NothingToClaim);
        }

        let amount = entitlement.amount;
        period.total_claimed = period
            .total_claimed
            .checked_add(amount)
            .ok_or(Error::Overflow)?;
        // Defence in depth: entitlements sum to the period total by
        // construction, so this can only trip on a bug.
        if period.total_claimed > period.total_contributed {
            return Err(Error::Overflow);
        }
        state.total_claimed = state
            .total_claimed
            .checked_add(amount)
            .ok_or(Error::Overflow)?;
        entitlement.claimed = true;

        env.storage().persistent().set(&key, &entitlement);
        bump(&env, &key);
        save_period(&env, marketplace_id, period_id, &period);
        save_rewards(&env, marketplace_id, &state);

        token_client(&env)?.transfer(&env.current_contract_address(), &member, &amount);

        env.events().publish(
            (symbol_short!("claim"), marketplace_id, period_id),
            (member, amount),
        );
        Ok(amount)
    }

    /// Read-only accessor for a marketplace's split config.
    pub fn get_marketplace(env: Env, marketplace_id: u64) -> Result<MarketplaceConfig, Error> {
        load_config(&env, marketplace_id)
    }

    /// Treasury totals and period count of a rewards marketplace, plus the
    /// ledger time the view was evaluated at.
    pub fn rewards_status(env: Env, marketplace_id: u64) -> Result<RewardsStatus, Error> {
        let state = load_rewards(&env, marketplace_id)?;
        Ok(RewardsStatus {
            period_count: state.period_count,
            total_contributed: state.total_contributed,
            total_claimed: state.total_claimed,
            now: env.ledger().timestamp(),
        })
    }

    pub fn get_period(env: Env, marketplace_id: u64, period_id: u32) -> Result<Period, Error> {
        load_rewards(&env, marketplace_id)?;
        load_period(&env, marketplace_id, period_id)
    }

    /// One member's final entitlement (closed periods only).
    pub fn get_entitlement(
        env: Env,
        marketplace_id: u64,
        period_id: u32,
        member: Address,
    ) -> Result<Entitlement, Error> {
        load_rewards(&env, marketplace_id)?;
        if !load_period(&env, marketplace_id, period_id)?.closed {
            return Err(Error::PeriodNotClosed);
        }
        env.storage()
            .persistent()
            .get(&DataKey::Entitlement(marketplace_id, period_id, member))
            .ok_or(Error::NotBeneficiary)
    }

    /// All entitlements of a closed period, in beneficiary order (bounded by
    /// MAX_BENEFICIARIES).
    pub fn get_entitlements(
        env: Env,
        marketplace_id: u64,
        period_id: u32,
    ) -> Result<Vec<Entitlement>, Error> {
        load_rewards(&env, marketplace_id)?;
        let period = load_period(&env, marketplace_id, period_id)?;
        if !period.closed {
            return Err(Error::PeriodNotClosed);
        }
        let mut out = Vec::new(&env);
        for member in period.beneficiaries.iter() {
            let entitlement: Entitlement = env
                .storage()
                .persistent()
                .get(&DataKey::Entitlement(marketplace_id, period_id, member))
                .ok_or(Error::NotBeneficiary)?;
            out.push_back(entitlement);
        }
        Ok(out)
    }
}

#[cfg(test)]
mod test;
