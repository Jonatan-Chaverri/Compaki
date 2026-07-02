//! Compaki marketplace contract.
//!
//! ONE deployment supports many marketplace instances, each keyed by a
//! `marketplace_id` with its own revenue-split config and vendor registry.
//! On-chain responsibilities are deliberately minimal: split config, vendor
//! registration, and atomic 3-way payment splitting. Everything else
//! (catalog, sessions, images) lives off-chain.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env,
};

pub const BPS_DENOM: u32 = 10_000;

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
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceConfig {
    pub operator: Address,
    pub community_fund: Address,
    pub vendor_bps: u32,
    pub operator_bps: u32,
    pub community_bps: u32,
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

#[contract]
pub struct MarketplaceContract;

#[contractimpl]
impl MarketplaceContract {
    /// One-time setup: stores the admin and the payment token (demo USDC SAC).
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &0u64);
        Ok(())
    }

    /// Registers a new marketplace instance and returns its id.
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
        operator.require_auth();

        let sum = vendor_bps
            .checked_add(operator_bps)
            .and_then(|s| s.checked_add(community_bps))
            .ok_or(Error::InvalidSplit)?;
        if sum != BPS_DENOM {
            return Err(Error::InvalidSplit);
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0u64);
        let config = MarketplaceConfig {
            operator,
            community_fund,
            vendor_bps,
            operator_bps,
            community_bps,
        };
        env.storage().persistent().set(&DataKey::Config(id), &config);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        env.events()
            .publish((symbol_short!("market"), id), config);
        Ok(id)
    }

    /// Registers a vendor in a marketplace. Only the marketplace's operator
    /// may call this.
    pub fn register_vendor(env: Env, marketplace_id: u64, vendor: Address) -> Result<(), Error> {
        let config: MarketplaceConfig = env
            .storage()
            .persistent()
            .get(&DataKey::Config(marketplace_id))
            .ok_or(Error::MarketplaceNotFound)?;
        config.operator.require_auth();

        env.storage()
            .persistent()
            .set(&DataKey::Vendor(marketplace_id, vendor.clone()), &true);

        env.events()
            .publish((symbol_short!("vendor"), marketplace_id), vendor);
        Ok(())
    }

    /// Executes a purchase: atomically moves `amount` of the payment token
    /// from the buyer to vendor / operator / community fund according to the
    /// marketplace's split. The rounding remainder always goes to the
    /// community fund so no dust is ever lost.
    pub fn purchase(
        env: Env,
        marketplace_id: u64,
        buyer: Address,
        vendor: Address,
        amount: i128,
    ) -> Result<(), Error> {
        buyer.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let config: MarketplaceConfig = env
            .storage()
            .persistent()
            .get(&DataKey::Config(marketplace_id))
            .ok_or(Error::MarketplaceNotFound)?;
        let registered: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Vendor(marketplace_id, vendor.clone()))
            .unwrap_or(false);
        if !registered {
            return Err(Error::VendorNotRegistered);
        }

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let client = token::Client::new(&env, &token_addr);

        // Integer split; both shares round down, remainder → community fund.
        let vendor_amount = amount * config.vendor_bps as i128 / BPS_DENOM as i128;
        let operator_amount = amount * config.operator_bps as i128 / BPS_DENOM as i128;
        let community_amount = amount - vendor_amount - operator_amount;

        // All transfers happen inside this single invocation — the split is
        // atomic: either every leg lands or the whole purchase fails.
        if vendor_amount > 0 {
            client.transfer(&buyer, &vendor, &vendor_amount);
        }
        if operator_amount > 0 {
            client.transfer(&buyer, &config.operator, &operator_amount);
        }
        if community_amount > 0 {
            client.transfer(&buyer, &config.community_fund, &community_amount);
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
        Ok(())
    }

    /// Read-only accessor for a marketplace's split config.
    pub fn get_marketplace(env: Env, marketplace_id: u64) -> Result<MarketplaceConfig, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Config(marketplace_id))
            .ok_or(Error::MarketplaceNotFound)
    }
}

#[cfg(test)]
mod test;
