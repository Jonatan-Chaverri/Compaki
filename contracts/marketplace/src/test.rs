#![cfg(test)]
extern crate std;

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
    platform: Address,
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
    let platform = Address::generate(&env);
    client.initialize(&admin, &sac.address(), &platform);

    Setup {
        client,
        token,
        token_admin,
        operator: Address::generate(&env),
        community_fund: Address::generate(&env),
        vendor: Address::generate(&env),
        buyer: Address::generate(&env),
        platform,
        env,
    }
}

#[test]
fn happy_path_purchase_splits_correctly() {
    let s = setup();

    // 88% vendor / 8% operator / 2% community (+ 2% platform fee).
    let id = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &8_800, &800, &200);
    assert_eq!(id, 0);
    s.client.register_vendor(&id, &s.vendor);

    // Buyer holds $100.00 (7 decimals).
    s.token_admin.mint(&s.buyer, &1_000_000_000);

    // Purchase of $42.00.
    s.client.purchase(&id, &s.buyer, &s.vendor, &420_000_000);

    assert_eq!(s.token.balance(&s.vendor), 369_600_000); // $36.96
    assert_eq!(s.token.balance(&s.operator), 33_600_000); // $3.36
    assert_eq!(s.token.balance(&s.community_fund), 8_400_000); // $0.84
    assert_eq!(s.token.balance(&s.platform), 8_400_000); // $0.84 platform fee
    assert_eq!(s.token.balance(&s.buyer), 580_000_000); // $58.00 left

    // Config is readable back.
    let config = s.client.get_marketplace(&id);
    assert_eq!(config.vendor_bps, 8_800);
    assert_eq!(config.operator, s.operator);
}

#[test]
fn purchase_rejects_unregistered_vendor() {
    let s = setup();
    let id = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &8_800, &800, &200);
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

    // 8_800 + 900 + 200 = 9_900 → rejected.
    let too_high = s
        .client
        .try_create_marketplace(&s.operator, &s.community_fund, &8_800, &900, &200);
    assert_eq!(too_high, Err(Ok(Error::InvalidSplit)));

    // 8_800 + 800 + 100 = 9_700 → rejected.
    let too_low = s
        .client
        .try_create_marketplace(&s.operator, &s.community_fund, &8_800, &800, &100);
    assert_eq!(too_low, Err(Ok(Error::InvalidSplit)));

    // 100% for the marketplace leaves nothing for the platform fee → rejected.
    let whole = s
        .client
        .try_create_marketplace(&s.operator, &s.community_fund, &9_000, &800, &200);
    assert_eq!(whole, Err(Ok(Error::InvalidSplit)));

    // Overflow attempt must not wrap around into a valid sum.
    let overflow = s.client.try_create_marketplace(
        &s.operator,
        &s.community_fund,
        &u32::MAX,
        &1,
        &10_000,
    );
    assert_eq!(overflow, Err(Ok(Error::InvalidSplit)));

    // Exact 9_800 (+ the 2% platform fee) is accepted.
    let ok = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &8_800, &800, &200);
    assert_eq!(ok, 0);
}

#[test]
fn rounding_remainder_goes_to_community_fund() {
    let s = setup();

    // Thirds of the 98% that can never divide evenly.
    let id = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &3_267, &3_267, &3_266);
    s.client.register_vendor(&id, &s.vendor);

    // 101 stroops: 101*3267/10000 = 32 (rounded down) for vendor and
    // operator, 101*200/10000 = 2 for the platform; community gets
    // 101 - 32 - 32 - 2 = 35, absorbing all the dust.
    s.token_admin.mint(&s.buyer, &101);
    s.client.purchase(&id, &s.buyer, &s.vendor, &101);

    assert_eq!(s.token.balance(&s.vendor), 32);
    assert_eq!(s.token.balance(&s.operator), 32);
    assert_eq!(s.token.balance(&s.platform), 2);
    assert_eq!(s.token.balance(&s.community_fund), 35);

    // Conservation: everything the buyer spent arrived somewhere.
    assert_eq!(s.token.balance(&s.buyer), 0);
    assert_eq!(
        s.token.balance(&s.vendor)
            + s.token.balance(&s.operator)
            + s.token.balance(&s.platform)
            + s.token.balance(&s.community_fund),
        101
    );
}

#[test]
fn purchase_rejects_zero_and_negative_amounts() {
    let s = setup();
    let id = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &8_800, &800, &200);
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
    let platform = Address::generate(&s.env);
    assert_eq!(
        s.client.try_initialize(&admin, &token, &platform),
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
        .create_marketplace(&s.operator, &s.community_fund, &8_800, &800, &200);
    let b = s
        .client
        .create_marketplace(&s.operator, &s.community_fund, &9_800, &0, &0);
    assert_eq!(a, 0);
    assert_eq!(b, 1);
}

// ─── Community Rewards & Fundraising ────────────────────────────────────────
//
// Setup uses mock_all_auths() for convenience on the happy path only. Every
// authorization claim is verified separately: positive paths assert the exact
// `env.auths()` that was required, and negative paths switch to strict mode
// (`set_auths(&[])` / targeted `mock_auths`) so a missing signature really
// fails.

mod community {
    use super::super::*;
    use super::std;
    use soroban_sdk::{
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Ledger, MockAuth, MockAuthInvoke},
        token::{Client as TokenClient, StellarAssetClient},
        vec, Address, Env, IntoVal, Symbol, Vec,
    };

    pub const DAY: u64 = 86_400;
    pub const PERIOD: u64 = 30 * DAY;
    pub const T0: u64 = 1_700_000_000;
    /// $1.00 in stroops.
    pub const USD: i128 = 10_000_000;

    pub struct C<'a> {
        pub env: Env,
        pub contract: Address,
        pub client: MarketplaceContractClient<'a>,
        pub token: TokenClient<'a>,
        pub token_admin: StellarAssetClient<'a>,
        pub admin: Address,
        pub operator: Address,
        pub v1: Address,
        pub v2: Address,
        pub b1: Address,
        pub b2: Address,
    }

    pub fn setup<'a>() -> C<'a> {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(T0);

        let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
        let token = TokenClient::new(&env, &sac.address());
        let token_admin = StellarAssetClient::new(&env, &sac.address());
        let contract = env.register_contract(None, MarketplaceContract);
        let client = MarketplaceContractClient::new(&env, &contract);
        let admin = Address::generate(&env);
        client.initialize(&admin, &sac.address(), &Address::generate(&env));

        let c = C {
            operator: Address::generate(&env),
            v1: Address::generate(&env),
            v2: Address::generate(&env),
            b1: Address::generate(&env),
            b2: Address::generate(&env),
            env,
            contract,
            client,
            token,
            token_admin,
            admin,
        };
        for who in [&c.b1, &c.b2, &c.v1, &c.v2] {
            c.token_admin.mint(who, &(10_000 * USD));
        }
        c
    }

    /// Rewards marketplace: 88% vendor / 5% operator / 5% community (+ 2%
    /// platform fee), 30-day periods, pool 60% vendors / 40% buyers.
    pub fn rewards_marketplace(c: &C) -> u64 {
        let id = c
            .client
            .create_rewards_marketplace(&c.operator, &8_800, &500, &500, &PERIOD, &6_000);
        c.client.register_vendor(&id, &c.v1);
        c.client.register_vendor(&id, &c.v2);
        id
    }

    pub fn advance(c: &C, seconds: u64) {
        let now = c.env.ledger().timestamp();
        c.env.ledger().set_timestamp(now + seconds);
    }

    mod rewards {
        use super::*;

        #[test]
        fn purchase_books_the_current_period() {
            let c = setup();
            let id = rewards_marketplace(&c);
            let receipt = c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));
            assert_eq!(
                receipt,
                PurchaseReceipt {
                    vendor_amount: 88 * USD,
                    operator_amount: 5 * USD,
                    community_amount: 5 * USD,
                    platform_amount: 2 * USD,
                    period: Some(0),
                    round: None,
                }
            );
            assert_eq!(c.token.balance(&c.contract), 5 * USD);
            assert_eq!(
                c.client.get_period(&id, &0),
                PeriodTotals {
                    vendor_pool: 3 * USD,
                    buyer_pool: 2 * USD,
                    vendor_volume: 100 * USD,
                    buyer_volume: 100 * USD,
                    total_claimed: 0,
                }
            );
            let status = c.client.rewards_status(&id);
            assert_eq!(status.start_ts, T0);
            assert_eq!(status.period_seconds, PERIOD);
            assert_eq!((status.vendor_pool_bps, status.buyer_pool_bps), (6_000, 4_000));
            assert_eq!(status.current_period, 0);
            assert_eq!(status.total_contributed, 5 * USD);
        }

        #[test]
        fn rewards_follow_sales_and_purchases() {
            let c = setup();
            let id = rewards_marketplace(&c);
            // $400 of sales → $20 community: $12 for vendors, $8 for buyers.
            c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));
            c.client.purchase(&id, &c.b2, &c.v2, &(300 * USD));
            advance(&c, PERIOD);

            let before = [&c.v1, &c.v2, &c.b1, &c.b2].map(|a| c.token.balance(a));
            assert_eq!(c.client.claim(&id, &0, &c.v1), 3 * USD); // 12 × 100/400
            assert_eq!(c.client.claim(&id, &0, &c.v2), 9 * USD); // 12 × 300/400
            assert_eq!(c.client.claim(&id, &0, &c.b1), 2 * USD); // 8 × 100/400
            assert_eq!(c.client.claim(&id, &0, &c.b2), 6 * USD); // 8 × 300/400
            let after = [&c.v1, &c.v2, &c.b1, &c.b2].map(|a| c.token.balance(a));
            assert_eq!(
                [after[0] - before[0], after[1] - before[1], after[2] - before[2], after[3] - before[3]],
                [3 * USD, 9 * USD, 2 * USD, 6 * USD]
            );
            assert_eq!(c.token.balance(&c.contract), 0);
            assert_eq!(c.client.rewards_status(&id).total_claimed, 20 * USD);
            assert_eq!(c.client.get_period(&id, &0).total_claimed, 20 * USD);
        }

        #[test]
        fn claim_rules() {
            let c = setup();
            let id = rewards_marketplace(&c);
            c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));

            // Running estimate while the period is open; no claim yet.
            let view = c.client.get_reward(&id, &0, &c.b1);
            assert_eq!(view.amount, 2 * USD);
            assert!(!view.period_ended && !view.claimed);
            assert_eq!(c.client.try_claim(&id, &0, &c.b1), Err(Ok(Error::PeriodNotEnded)));
            assert_eq!(c.client.try_claim(&id, &1, &c.b1), Err(Ok(Error::PeriodNotFound)));
            assert_eq!(c.client.try_get_reward(&id, &1, &c.b1), Err(Ok(Error::PeriodNotFound)));

            advance(&c, PERIOD);
            assert!(c.client.get_reward(&id, &0, &c.b1).period_ended);
            assert_eq!(c.client.claim(&id, &0, &c.b1), 2 * USD);
            assert!(c.client.get_reward(&id, &0, &c.b1).claimed);
            assert_eq!(c.client.try_claim(&id, &0, &c.b1), Err(Ok(Error::AlreadyClaimed)));
            // Someone who neither sold nor bought in the period.
            assert_eq!(c.client.try_claim(&id, &0, &c.b2), Err(Ok(Error::NothingToClaim)));
            // A period without any sale has nothing for anyone.
            assert_eq!(c.client.try_claim(&id, &1, &c.b1), Err(Ok(Error::PeriodNotEnded)));
            advance(&c, PERIOD);
            assert_eq!(c.client.try_claim(&id, &1, &c.b1), Err(Ok(Error::NothingToClaim)));
        }

        #[test]
        fn periods_follow_automatically() {
            let c = setup();
            let id = rewards_marketplace(&c);
            assert_eq!(c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD)).period, Some(0));
            advance(&c, PERIOD - 1);
            assert_eq!(c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD)).period, Some(0));
            advance(&c, 1);
            assert_eq!(c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD)).period, Some(1));
            // Months without sales leave no gap to fill: sales just land in
            // whichever period is current.
            advance(&c, 5 * PERIOD);
            assert_eq!(c.client.purchase(&id, &c.b2, &c.v2, &(100 * USD)).period, Some(6));
            assert_eq!(c.client.rewards_status(&id).current_period, 6);

            // Each period is shared only among its own participants.
            assert_eq!(c.client.get_reward(&id, &0, &c.b1).amount, 4 * USD);
            assert_eq!(c.client.get_reward(&id, &1, &c.b1).amount, 2 * USD);
            assert_eq!(c.client.get_reward(&id, &6, &c.b1).amount, 0);
            assert_eq!(c.client.get_reward(&id, &6, &c.b2).amount, 2 * USD);
            assert_eq!(c.client.get_period(&id, &3).vendor_volume, 0);
        }

        #[test]
        fn vendor_buying_from_itself_counts_on_both_sides() {
            let c = setup();
            let id = rewards_marketplace(&c);
            c.client.purchase(&id, &c.v1, &c.v1, &(100 * USD));
            let view = c.client.get_reward(&id, &0, &c.v1);
            assert_eq!((view.vendor_volume, view.buyer_volume), (100 * USD, 100 * USD));
            advance(&c, PERIOD);
            assert_eq!(c.client.claim(&id, &0, &c.v1), 5 * USD);
        }

        /// Selling to yourself to win a bigger share of other people's pool
        /// always loses money: the operator and platform shares of the fake
        /// sales are gone for good, and what comes back is at most what the
        /// fake sales put in plus the share taken from others, which is
        /// exactly cancelled by the share of its own contribution given away.
        #[test]
        fn wash_trading_never_pays() {
            let c = setup();
            for wash in [1, 50, 100, 1_000, 5_000] {
                let start = c.token.balance(&c.v1);
                let id2 = rewards_marketplace(&c);
                c.client.purchase(&id2, &c.b1, &c.v2, &(100 * USD));
                c.client.purchase(&id2, &c.v1, &c.v1, &(wash * USD));
                advance(&c, PERIOD);
                let period = c.client.rewards_status(&id2).current_period - 1;
                c.client.claim(&id2, &period, &c.v1);
                let net = c.token.balance(&c.v1) - start;
                // Loses at least the 5% operator + 2% platform shares.
                assert!(net <= -(wash * USD * 7 / 100), "wash {wash}: net {net}");
            }
        }

        #[test]
        fn rounding_never_overpays() {
            let c = setup();
            let id = c
                .client
                .create_rewards_marketplace(&c.operator, &3_267, &3_267, &3_266, &PERIOD, &3_333);
            c.client.register_vendor(&id, &c.v1);
            c.client.register_vendor(&id, &c.v2);
            let buyers: std::vec::Vec<Address> = (0..7).map(|_| Address::generate(&c.env)).collect();
            for (i, b) in buyers.iter().enumerate() {
                c.token_admin.mint(b, &1_000_000);
                let vendor = if i % 2 == 0 { &c.v1 } else { &c.v2 };
                c.client.purchase(&id, b, vendor, &(97 + 13 * i as i128));
            }
            let totals = c.client.get_period(&id, &0);
            advance(&c, PERIOD);
            let mut paid = 0;
            for who in buyers.iter().chain([&c.v1, &c.v2]) {
                if let Ok(Ok(amount)) = c.client.try_claim(&id, &0, who) {
                    paid += amount;
                }
            }
            let pools = totals.vendor_pool + totals.buyer_pool;
            assert!(paid <= pools);
            assert!(pools - paid < 9, "dust {} must stay under one stroop per participant", pools - paid);
            assert_eq!(c.token.balance(&c.contract), pools - paid);
        }

        #[test]
        fn whole_pool_to_one_side() {
            let c = setup();
            for (vendor_pool, vendor_gets, buyer_gets) in [(10_000u32, 5 * USD, 0), (0, 0, 5 * USD)] {
                let id = c
                    .client
                    .create_rewards_marketplace(&c.operator, &8_800, &500, &500, &PERIOD, &vendor_pool);
                c.client.register_vendor(&id, &c.v1);
                c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));
                advance(&c, PERIOD);
                let k = c.client.rewards_status(&id).current_period - 1;
                assert_eq!(c.client.get_reward(&id, &k, &c.v1).amount, vendor_gets);
                assert_eq!(c.client.get_reward(&id, &k, &c.b1).amount, buyer_gets);
            }
        }

        #[test]
        fn invalid_configurations_rejected() {
            let c = setup();
            let create = |community: u32, period: u64, pool: u32| {
                c.client.try_create_rewards_marketplace(
                    &c.operator,
                    &(9_800 - 500 - community),
                    &500,
                    &community,
                    &period,
                    &pool,
                )
            };
            assert_eq!(create(0, PERIOD, 5_000), Err(Ok(Error::InvalidSplit)));
            assert_eq!(create(500, MIN_PERIOD_SECONDS - 1, 5_000), Err(Ok(Error::InvalidRewardsConfig)));
            assert_eq!(create(500, MAX_PERIOD_SECONDS + 1, 5_000), Err(Ok(Error::InvalidRewardsConfig)));
            assert_eq!(create(500, PERIOD, 10_001), Err(Ok(Error::InvalidRewardsConfig)));
            assert_eq!(
                c.client.try_create_rewards_marketplace(&c.operator, &8_800, &500, &600, &PERIOD, &5_000),
                Err(Ok(Error::InvalidSplit))
            );
            assert!(create(500, MIN_PERIOD_SECONDS, 0).is_ok());
            assert!(create(500, MAX_PERIOD_SECONDS, 10_000).is_ok());
        }

        #[test]
        fn nobody_can_withdraw_the_treasury() {
            let c = setup();
            let id = rewards_marketplace(&c);
            c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));
            advance(&c, PERIOD);
            let treasury = c.token.balance(&c.contract);
            assert_eq!(treasury, 5 * USD);

            // (a) Admin and operator took no part in the period.
            assert_eq!(c.client.try_claim(&id, &0, &c.admin), Err(Ok(Error::NothingToClaim)));
            assert_eq!(c.client.try_claim(&id, &0, &c.operator), Err(Ok(Error::NothingToClaim)));

            // (b) Going around the contract: a token transfer out of the
            //     contract authorized by the admin or the operator. Positive
            //     control first: the operator can move its OWN funds.
            c.env.mock_auths(&[MockAuth {
                address: &c.operator,
                invoke: &MockAuthInvoke {
                    contract: &c.token.address,
                    fn_name: "transfer",
                    args: (&c.operator, &c.admin, 1i128).into_val(&c.env),
                    sub_invokes: &[],
                },
            }]);
            c.token.transfer(&c.operator, &c.admin, &1);
            for thief in [&c.admin, &c.operator] {
                c.env.mock_auths(&[MockAuth {
                    address: thief,
                    invoke: &MockAuthInvoke {
                        contract: &c.token.address,
                        fn_name: "transfer",
                        args: (&c.contract, thief, treasury).into_val(&c.env),
                        sub_invokes: &[],
                    },
                }]);
                assert!(c.token.try_transfer(&c.contract, thief, &treasury).is_err());
            }

            // (c) The operator signing a claim for a participant fails.
            c.env.mock_auths(&[MockAuth {
                address: &c.operator,
                invoke: &MockAuthInvoke {
                    contract: &c.contract,
                    fn_name: "claim",
                    args: (id, 0u32, &c.b1).into_val(&c.env),
                    sub_invokes: &[],
                },
            }]);
            assert!(c.client.try_claim(&id, &0, &c.b1).is_err());
            assert_eq!(c.token.balance(&c.contract), treasury);
        }

        #[test]
        fn marketplaces_are_isolated() {
            let c = setup();
            let a = rewards_marketplace(&c);
            let b = rewards_marketplace(&c);
            c.client.purchase(&a, &c.b1, &c.v1, &(100 * USD));
            c.client.purchase(&b, &c.b2, &c.v2, &(300 * USD));
            advance(&c, PERIOD);
            assert_eq!(c.client.try_claim(&a, &0, &c.b2), Err(Ok(Error::NothingToClaim)));
            assert_eq!(c.client.claim(&a, &0, &c.b1), 2 * USD);
            assert_eq!(c.client.claim(&b, &0, &c.b2), 6 * USD);
            assert_eq!(c.client.get_period(&a, &0).buyer_pool, 2 * USD);
        }

        #[test]
        fn required_authorizations() {
            let c = setup();
            let e = &c.env;
            let id = c
                .client
                .create_rewards_marketplace(&c.operator, &8_800, &500, &500, &PERIOD, &6_000);
            assert_eq!(e.auths().len(), 1);
            assert_eq!(e.auths()[0].0, c.operator);
            c.client.register_vendor(&id, &c.v1);

            // purchase: exactly the buyer (covering the token sub-transfers).
            c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));
            let auths = e.auths();
            assert_eq!(auths.len(), 1);
            assert_eq!(auths[0].0, c.b1);

            // claim: exactly the participant.
            advance(&c, PERIOD);
            c.client.claim(&id, &0, &c.v1);
            assert_eq!(
                e.auths(),
                std::vec![(
                    c.v1.clone(),
                    AuthorizedInvocation {
                        function: AuthorizedFunction::Contract((
                            c.contract.clone(),
                            Symbol::new(e, "claim"),
                            (id, 0u32, c.v1.clone()).into_val(e),
                        )),
                        sub_invocations: std::vec![],
                    }
                )]
            );

            // Strict mode: no signatures at all.
            e.set_auths(&[]);
            assert!(c.client.try_claim(&id, &0, &c.b1).is_err());
            assert!(c.client.try_purchase(&id, &c.b1, &c.v1, &1_000).is_err());
            assert!(c
                .client
                .try_create_rewards_marketplace(&c.operator, &8_800, &500, &500, &PERIOD, &6_000)
                .is_err());
            assert!(c.client.try_register_vendor(&id, &c.b2).is_err());

            // b1 claiming with its own signature works; it can't pay someone else.
            e.mock_auths(&[MockAuth {
                address: &c.b1,
                invoke: &MockAuthInvoke {
                    contract: &c.contract,
                    fn_name: "claim",
                    args: (id, 0u32, &c.b1).into_val(e),
                    sub_invokes: &[],
                },
            }]);
            assert_eq!(c.client.claim(&id, &0, &c.b1), 2 * USD);
        }

        #[test]
        fn classic_marketplace_unchanged() {
            let c = setup();
            let fund = Address::generate(&c.env);
            let id = c.client.create_marketplace(&c.operator, &fund, &8_800, &800, &200);
            c.client.register_vendor(&id, &c.v1);
            let receipt = c.client.purchase(&id, &c.b1, &c.v1, &(42 * USD));
            assert_eq!((receipt.period, receipt.round), (None, None));
            assert_eq!(c.token.balance(&fund), 8_400_000);
            assert_eq!(c.token.balance(&c.contract), 0);
            assert_eq!(c.client.try_rewards_status(&id), Err(Ok(Error::RewardsNotEnabled)));
            assert_eq!(c.client.try_get_fundraise(&id), Err(Ok(Error::FundraiseNotEnabled)));
        }
    }

    mod fundraise {
        use super::*;

        pub struct F<'a> {
            pub c: C<'a>,
            pub id: u64,
            pub r1: Address,
            pub r2: Address,
        }

        /// 88% / 5% / 5% community; $10 target paid 70% / 30% to r1 / r2.
        pub fn fundraiser<'a>(policy: GoalPolicy) -> F<'a> {
            let c = setup();
            let (r1, r2) = (Address::generate(&c.env), Address::generate(&c.env));
            let id = c.client.create_fundraise_marketplace(
                &c.operator,
                &8_800,
                &500,
                &500,
                &(10 * USD),
                &vec![&c.env, r1.clone(), r2.clone()],
                &vec![&c.env, 7_000u32, 3_000],
                &policy,
            );
            c.client.register_vendor(&id, &c.v1);
            F { c, id, r1, r2 }
        }

        /// Two $100 sales raise the $10 target; then anyone releases it.
        fn reach_and_release(f: &F) {
            let c = &f.c;
            assert_eq!(c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD)).round, Some(0));
            assert_eq!(c.client.try_release_fundraise(&f.id), Err(Ok(Error::GoalNotReached)));
            c.client.purchase(&f.id, &c.b2, &c.v1, &(100 * USD));
            assert_eq!(c.client.release_fundraise(&f.id), 10 * USD);
            assert_eq!(c.token.balance(&f.r1), 7 * USD);
            assert_eq!(c.token.balance(&f.r2), 3 * USD);
            assert_eq!(c.token.balance(&c.contract), 0);
        }

        #[test]
        fn raises_until_target_then_anyone_releases() {
            let f = fundraiser(GoalPolicy::Stop);
            let c = &f.c;
            c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD));
            let state = c.client.get_fundraise(&f.id);
            assert_eq!((state.raised, state.round, state.goal_reached), (5 * USD, 0, false));
            assert_eq!(c.token.balance(&c.contract), 5 * USD);
            c.client.purchase(&f.id, &c.b2, &c.v1, &(100 * USD));

            // Permissionless: no signature at all is needed.
            c.env.set_auths(&[]);
            assert_eq!(c.client.release_fundraise(&f.id), 10 * USD);
            assert_eq!(c.env.auths(), std::vec![]);
            let state = c.client.get_fundraise(&f.id);
            assert_eq!((state.raised, state.round, state.goal_reached), (0, 1, true));
            assert_eq!((state.total_raised, state.total_released), (10 * USD, 10 * USD));
            assert_eq!(c.token.balance(&f.r1), 7 * USD);
            assert_eq!(c.token.balance(&f.r2), 3 * USD);
        }

        #[test]
        fn release_pays_everything_raised_even_above_target() {
            let f = fundraiser(GoalPolicy::NewRound);
            let c = &f.c;
            c.client.purchase(&f.id, &c.b1, &c.v1, &(300 * USD)); // $15 raised
            assert_eq!(c.client.release_fundraise(&f.id), 15 * USD);
            assert_eq!(c.token.balance(&f.r1), 10 * USD + 5_000_000); // $10.50
            assert_eq!(c.token.balance(&f.r2), 4 * USD + 5_000_000); // $4.50
        }

        #[test]
        fn stop_gives_later_community_shares_to_the_vendor() {
            let f = fundraiser(GoalPolicy::Stop);
            let c = &f.c;
            reach_and_release(&f);
            let vendor_before = c.token.balance(&c.v1);
            let receipt = c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD));
            assert_eq!(receipt.vendor_amount, 93 * USD);
            assert_eq!((receipt.community_amount, receipt.round), (0, None));
            assert_eq!(c.token.balance(&c.v1) - vendor_before, 93 * USD);
            assert_eq!(c.token.balance(&c.contract), 0);
            assert_eq!(c.client.try_release_fundraise(&f.id), Err(Ok(Error::GoalNotReached)));
        }

        #[test]
        fn new_round_raises_again_toward_the_same_target() {
            let f = fundraiser(GoalPolicy::NewRound);
            let c = &f.c;
            reach_and_release(&f);
            assert_eq!(c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD)).round, Some(1));
            assert_eq!(c.client.try_release_fundraise(&f.id), Err(Ok(Error::GoalNotReached)));
            c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD));
            assert_eq!(c.client.release_fundraise(&f.id), 10 * USD);
            assert_eq!(c.token.balance(&f.r1), 14 * USD);
            assert_eq!(c.client.get_fundraise(&f.id).round, 2);
        }

        #[test]
        fn direct_pays_recipients_with_every_later_sale() {
            let f = fundraiser(GoalPolicy::Direct);
            let c = &f.c;
            reach_and_release(&f);
            let receipt = c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD));
            assert_eq!((receipt.community_amount, receipt.round), (5 * USD, None));
            assert_eq!(c.token.balance(&f.r1), 7 * USD + 35_000_000);
            assert_eq!(c.token.balance(&f.r2), 3 * USD + 15_000_000);
            assert_eq!(c.token.balance(&c.contract), 0);
            assert_eq!(c.client.get_fundraise(&f.id).total_released, 15 * USD);
        }

        #[test]
        fn release_rounding_pays_every_stroop() {
            let c = setup();
            let rs: std::vec::Vec<Address> = (0..3).map(|_| Address::generate(&c.env)).collect();
            let id = c.client.create_fundraise_marketplace(
                &c.operator,
                &8_800,
                &500,
                &500,
                &1,
                &Vec::from_slice(&c.env, &rs),
                &vec![&c.env, 3_333u32, 3_333, 3_334],
                &GoalPolicy::NewRound,
            );
            c.client.register_vendor(&id, &c.v1);
            c.client.purchase(&id, &c.b1, &c.v1, &101); // 101 - 88 - 5 - 2 = 6 raised
            c.client.purchase(&id, &c.b1, &c.v1, &(7 * USD + 3));
            let raised = c.client.get_fundraise(&id).raised;
            assert_eq!(c.client.release_fundraise(&id), raised);
            let paid: i128 = rs.iter().map(|r| c.token.balance(r)).sum();
            assert_eq!(paid, raised);
            assert_eq!(c.token.balance(&c.contract), 0);
        }

        #[test]
        fn invalid_configurations_rejected() {
            let c = setup();
            let e = &c.env;
            let (x, y) = (Address::generate(e), Address::generate(e));
            let create = |community: u32, target: i128, rs: Vec<Address>, shares: Vec<u32>| {
                c.client.try_create_fundraise_marketplace(
                    &c.operator,
                    &(9_800 - 500 - community),
                    &500,
                    &community,
                    &target,
                    &rs,
                    &shares,
                    &GoalPolicy::Stop,
                )
            };
            let two = vec![e, x.clone(), y.clone()];
            let half = vec![e, 5_000u32, 5_000];
            assert_eq!(create(0, USD, two.clone(), half.clone()), Err(Ok(Error::InvalidSplit)));
            assert_eq!(create(500, 0, two.clone(), half.clone()), Err(Ok(Error::InvalidGoal)));
            assert_eq!(create(500, -1, two.clone(), half.clone()), Err(Ok(Error::InvalidGoal)));
            let bad = Err(Ok(Error::InvalidRecipients));
            assert_eq!(create(500, USD, vec![e], vec![e]), bad);
            assert_eq!(create(500, USD, two.clone(), vec![e, 10_000u32]), bad);
            assert_eq!(create(500, USD, two.clone(), vec![e, 6_000u32, 3_000]), bad);
            assert_eq!(create(500, USD, two.clone(), vec![e, 10_000u32, 0]), bad);
            assert_eq!(create(500, USD, vec![e, x.clone(), x.clone()], half.clone()), bad);
            assert_eq!(create(500, USD, vec![e, x.clone(), c.contract.clone()], half.clone()), bad);
            let many: std::vec::Vec<Address> = (0..21).map(|_| Address::generate(e)).collect();
            let mut shares = std::vec![476u32; 21];
            shares[0] = 10_000 - 476 * 20;
            assert_eq!(
                create(500, USD, Vec::from_slice(e, &many), Vec::from_slice(e, &shares)),
                bad
            );
            assert!(create(500, USD, two, half).is_ok());
        }

        #[test]
        fn nobody_can_take_the_raised_funds() {
            let f = fundraiser(GoalPolicy::Stop);
            let c = &f.c;
            c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD));
            let held = c.token.balance(&c.contract);
            for thief in [&c.admin, &c.operator] {
                c.env.mock_auths(&[MockAuth {
                    address: thief,
                    invoke: &MockAuthInvoke {
                        contract: &c.token.address,
                        fn_name: "transfer",
                        args: (&c.contract, thief, held).into_val(&c.env),
                        sub_invokes: &[],
                    },
                }]);
                assert!(c.token.try_transfer(&c.contract, thief, &held).is_err());
            }
            // Below target, nothing can be released, not even to the recipients.
            assert_eq!(c.client.try_release_fundraise(&f.id), Err(Ok(Error::GoalNotReached)));
            assert_eq!(c.token.balance(&c.contract), held);
            // Rewards entry points don't apply to a fundraiser and vice versa.
            c.env.mock_all_auths();
            assert_eq!(c.client.try_claim(&f.id, &0, &c.b1), Err(Ok(Error::RewardsNotEnabled)));
            let rewards = rewards_marketplace(c);
            assert_eq!(c.client.try_release_fundraise(&rewards), Err(Ok(Error::FundraiseNotEnabled)));
        }

        #[test]
        fn rules_are_public() {
            let f = fundraiser(GoalPolicy::Direct);
            let state = f.c.client.get_fundraise(&f.id);
            assert_eq!(state.target, 10 * USD);
            assert_eq!(state.recipients, vec![&f.c.env, f.r1.clone(), f.r2.clone()]);
            assert_eq!(state.shares_bps, vec![&f.c.env, 7_000u32, 3_000]);
            assert_eq!(state.policy, GoalPolicy::Direct);
        }
    }
}

// ─── Platform fee ───────────────────────────────────────────────────────────

mod platform_fee {
    use super::super::*;
    use soroban_sdk::{testutils::Address as _, token::{Client as TokenClient, StellarAssetClient}, Address, Env};

    #[test]
    fn fee_is_fixed_two_percent_paid_to_the_platform() {
        let env = Env::default();
        env.mock_all_auths();
        let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
        let token = TokenClient::new(&env, &sac.address());
        let contract = env.register_contract(None, MarketplaceContract);
        let client = MarketplaceContractClient::new(&env, &contract);
        let platform = Address::generate(&env);
        client.initialize(&Address::generate(&env), &sac.address(), &platform);

        let view = client.get_platform();
        assert_eq!(view.recipient, platform);
        assert_eq!(view.fee_bps, 200);

        // 93% vendor / 5% operator / 0% community + 2% platform.
        let (operator, fund, vendor, buyer) = (
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        );
        let id = client.create_marketplace(&operator, &fund, &9_300, &500, &0);
        client.register_vendor(&id, &vendor);
        StellarAssetClient::new(&env, &sac.address()).mint(&buyer, &1_000_000_000);
        client.purchase(&id, &buyer, &vendor, &1_000_000_000); // $100

        assert_eq!(token.balance(&vendor), 930_000_000); // $93
        assert_eq!(token.balance(&operator), 50_000_000); // $5
        assert_eq!(token.balance(&platform), 20_000_000); // $2
        assert_eq!(token.balance(&fund), 0);
        assert_eq!(token.balance(&contract), 0); // nothing held for classic sales
    }

    #[test]
    fn platform_recipient_cannot_be_the_contract_or_changed() {
        let env = Env::default();
        env.mock_all_auths();
        let contract = env.register_contract(None, MarketplaceContract);
        let client = MarketplaceContractClient::new(&env, &contract);
        let token = Address::generate(&env);
        assert_eq!(
            client.try_initialize(&Address::generate(&env), &token, &contract),
            Err(Ok(Error::InvalidAddress))
        );
        let platform = Address::generate(&env);
        client.initialize(&Address::generate(&env), &token, &platform);
        // initialize is the only setter and it runs once.
        assert_eq!(
            client.try_initialize(&Address::generate(&env), &token, &Address::generate(&env)),
            Err(Ok(Error::AlreadyInitialized))
        );
        assert_eq!(client.get_platform().recipient, platform);
    }
}
