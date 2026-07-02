#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env,
};

struct Setup<'a> {
    env: Env,
    client: MarketplaceContractClient<'a>,
    token: TokenClient<'a>,
    token_admin: StellarAssetClient<'a>,
    operator: Address,
    community_fund: Address,
    vendor: Address,
    buyer: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let token_issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_issuer);
    let token = TokenClient::new(&env, &sac.address());
    let token_admin = StellarAssetClient::new(&env, &sac.address());

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &sac.address());

    Setup {
        client,
        token,
        token_admin,
        operator: Address::generate(&env),
        community_fund: Address::generate(&env),
        vendor: Address::generate(&env),
        buyer: Address::generate(&env),
        env,
    }
}

#[test]
fn happy_path_purchase_splits_correctly() {
    let s = setup();

    // 90% vendor / 8% operator / 2% community.
    let id = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &9_000, &800, &200);
    assert_eq!(id, 0);
    s.client.register_vendor(&id, &s.vendor);

    // Buyer holds $100.00 (7 decimals).
    s.token_admin.mint(&s.buyer, &1_000_000_000);

    // Purchase of $42.00.
    s.client.purchase(&id, &s.buyer, &s.vendor, &420_000_000);

    assert_eq!(s.token.balance(&s.vendor), 378_000_000); // $37.80
    assert_eq!(s.token.balance(&s.operator), 33_600_000); // $3.36
    assert_eq!(s.token.balance(&s.community_fund), 8_400_000); // $0.84
    assert_eq!(s.token.balance(&s.buyer), 580_000_000); // $58.00 left

    // Config is readable back.
    let config = s.client.get_marketplace(&id);
    assert_eq!(config.vendor_bps, 9_000);
    assert_eq!(config.operator, s.operator);
}

#[test]
fn purchase_rejects_unregistered_vendor() {
    let s = setup();
    let id = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &9_000, &800, &200);
    s.token_admin.mint(&s.buyer, &1_000_000_000);

    // Vendor never registered.
    let result = s
        .client
        .try_purchase(&id, &s.buyer, &s.vendor, &420_000_000);
    assert_eq!(result, Err(Ok(Error::VendorNotRegistered)));

    // No money moved.
    assert_eq!(s.token.balance(&s.buyer), 1_000_000_000);
}

#[test]
fn create_marketplace_validates_bps_sum() {
    let s = setup();

    // 9_000 + 900 + 200 = 10_100 → rejected.
    let too_high = s
        .client
        .try_create_marketplace(&s.operator, &s.community_fund, &9_000, &900, &200);
    assert_eq!(too_high, Err(Ok(Error::InvalidSplit)));

    // 9_000 + 800 + 100 = 9_900 → rejected.
    let too_low = s
        .client
        .try_create_marketplace(&s.operator, &s.community_fund, &9_000, &800, &100);
    assert_eq!(too_low, Err(Ok(Error::InvalidSplit)));

    // Overflow attempt must not wrap around into a valid sum.
    let overflow = s.client.try_create_marketplace(
        &s.operator,
        &s.community_fund,
        &u32::MAX,
        &1,
        &10_000,
    );
    assert_eq!(overflow, Err(Ok(Error::InvalidSplit)));

    // Exact 10_000 is accepted.
    let ok = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &9_000, &800, &200);
    assert_eq!(ok, 0);
}

#[test]
fn rounding_remainder_goes_to_community_fund() {
    let s = setup();

    // Thirds that can never divide evenly.
    let id = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &3_333, &3_333, &3_334);
    s.client.register_vendor(&id, &s.vendor);

    // 101 stroops: 101*3333/10000 = 33 (rounded down) for vendor and
    // operator; community gets 101 - 33 - 33 = 35, absorbing the dust.
    s.token_admin.mint(&s.buyer, &101);
    s.client.purchase(&id, &s.buyer, &s.vendor, &101);

    assert_eq!(s.token.balance(&s.vendor), 33);
    assert_eq!(s.token.balance(&s.operator), 33);
    assert_eq!(s.token.balance(&s.community_fund), 35);

    // Conservation: everything the buyer spent arrived somewhere.
    assert_eq!(s.token.balance(&s.buyer), 0);
    assert_eq!(
        s.token.balance(&s.vendor)
            + s.token.balance(&s.operator)
            + s.token.balance(&s.community_fund),
        101
    );
}

#[test]
fn purchase_rejects_zero_and_negative_amounts() {
    let s = setup();
    let id = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &9_000, &800, &200);
    s.client.register_vendor(&id, &s.vendor);
    s.token_admin.mint(&s.buyer, &1_000);

    assert_eq!(
        s.client.try_purchase(&id, &s.buyer, &s.vendor, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.client.try_purchase(&id, &s.buyer, &s.vendor, &-5),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn purchase_rejects_unknown_marketplace() {
    let s = setup();
    s.token_admin.mint(&s.buyer, &1_000);
    assert_eq!(
        s.client.try_purchase(&99, &s.buyer, &s.vendor, &100),
        Err(Ok(Error::MarketplaceNotFound))
    );
}

#[test]
fn initialize_only_once() {
    let s = setup();
    let admin = Address::generate(&s.env);
    let token = Address::generate(&s.env);
    assert_eq!(
        s.client.try_initialize(&admin, &token),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn register_vendor_requires_existing_marketplace() {
    let s = setup();
    assert_eq!(
        s.client.try_register_vendor(&42, &s.vendor),
        Err(Ok(Error::MarketplaceNotFound))
    );
}

#[test]
fn marketplace_ids_increment() {
    let s = setup();
    let a = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &9_000, &800, &200);
    let b = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &10_000, &0, &0);
    assert_eq!(a, 0);
    assert_eq!(b, 1);
}
