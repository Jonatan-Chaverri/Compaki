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

    /// Lets the current period run its length, then distributes it unchanged.
    pub fn end_period(c: &C, id: u64) -> i128 {
        advance(c, PERIOD);
        c.client.distribute(&id, &None)
    }

    pub fn rules(vendor: u32, buyer: u32, seconds: u64) -> Option<RewardsRules> {
        Some(RewardsRules { vendor_pool_bps: vendor, buyer_pool_bps: buyer, period_seconds: seconds })
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
            let totals = c.client.get_period(&id, &0);
            assert_eq!((totals.vendor_pool, totals.buyer_pool), (3 * USD, 2 * USD));
            assert_eq!((totals.vendor_volume, totals.buyer_volume), (100 * USD, 100 * USD));
            assert_eq!((totals.start_ts, totals.end_ts, totals.distributed), (T0, 0, false));
            let status = c.client.rewards_status(&id);
            assert_eq!((status.current_period, status.period_start, status.period_end), (0, T0, T0 + PERIOD));
            assert_eq!((status.vendor_pool_bps, status.buyer_pool_bps), (6_000, 4_000));
            assert_eq!(status.total_contributed, 5 * USD);
        }

        #[test]
        fn rewards_follow_sales_and_purchases() {
            let c = setup();
            let id = rewards_marketplace(&c);
            // $400 of sales → $20 community: $12 for vendors, $8 for buyers.
            c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));
            c.client.purchase(&id, &c.b2, &c.v2, &(300 * USD));
            assert_eq!(end_period(&c, id), 20 * USD);

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
        fn distribution_waits_for_the_period_length() {
            let c = setup();
            let id = rewards_marketplace(&c);
            c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));
            advance(&c, PERIOD - 1);
            assert_eq!(c.client.try_distribute(&id, &None), Err(Ok(Error::PeriodNotEnded)));
            // Until distributed, sales still land in the running period.
            assert_eq!(c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD)).period, Some(0));
            advance(&c, 1);
            assert_eq!(c.client.distribute(&id, &None), 10 * USD);
            let totals = c.client.get_period(&id, &0);
            assert_eq!((totals.end_ts, totals.distributed), (T0 + PERIOD, true));
            // The next period started at the distribution, with the same rules.
            let status = c.client.rewards_status(&id);
            assert_eq!((status.current_period, status.period_start), (1, T0 + PERIOD));
            assert_eq!((status.period_seconds, status.vendor_pool_bps), (PERIOD, 6_000));
            assert_eq!(c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD)).period, Some(1));
            assert_eq!(c.client.try_distribute(&id, &None), Err(Ok(Error::PeriodNotEnded)));
            // A period without sales distributes too (an empty pool).
            advance(&c, PERIOD);
            c.client.distribute(&id, &None);
            advance(&c, PERIOD);
            assert_eq!(c.client.distribute(&id, &None), 0);
            assert_eq!(c.client.rewards_status(&id).current_period, 3);
        }

        #[test]
        fn operator_sets_the_next_periods_rules_at_distribution() {
            let c = setup();
            let id = rewards_marketplace(&c);
            c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));
            advance(&c, PERIOD);
            c.client.distribute(&id, &rules(2_000, 8_000, 180 * DAY));
            let status = c.client.rewards_status(&id);
            assert_eq!((status.vendor_pool_bps, status.buyer_pool_bps), (2_000, 8_000));
            assert_eq!((status.period_seconds, status.period_end), (180 * DAY, T0 + PERIOD + 180 * DAY));

            // The distributed period kept its own rules: 60% / 40%.
            assert_eq!(c.client.get_period(&id, &0).vendor_pool_bps, 6_000);
            assert_eq!(c.client.get_reward(&id, &0, &c.v1).amount, 3 * USD);
            // The new period uses the new ones: 20% / 80% of $5.
            c.client.purchase(&id, &c.b2, &c.v2, &(100 * USD));
            let totals = c.client.get_period(&id, &1);
            assert_eq!((totals.vendor_pool_bps, totals.vendor_pool, totals.buyer_pool), (2_000, USD, 4 * USD));
            // …and its new length.
            advance(&c, PERIOD);
            assert_eq!(c.client.try_distribute(&id, &None), Err(Ok(Error::PeriodNotEnded)));
            advance(&c, 150 * DAY);
            assert_eq!(c.client.distribute(&id, &None), 5 * USD);
        }

        #[test]
        fn next_rules_are_validated_and_need_the_operator() {
            let c = setup();
            let id = rewards_marketplace(&c);
            advance(&c, PERIOD);
            let bad = Err(Ok(Error::InvalidRewardsConfig));
            assert_eq!(c.client.try_distribute(&id, &rules(6_000, 3_000, PERIOD)), bad);
            assert_eq!(c.client.try_distribute(&id, &rules(10_001, 0, PERIOD)), bad);
            assert_eq!(c.client.try_distribute(&id, &rules(5_000, 5_000, MIN_PERIOD_SECONDS - 1)), bad);
            assert_eq!(c.client.try_distribute(&id, &rules(5_000, 5_000, MAX_PERIOD_SECONDS + 1)), bad);

            // Strict auth: without the operator, new rules are refused…
            let e = &c.env;
            e.set_auths(&[]);
            assert!(c.client.try_distribute(&id, &rules(5_000, 5_000, PERIOD)).is_err());
            // …and a stranger's signature doesn't count.
            let stranger = Address::generate(e);
            e.mock_auths(&[MockAuth {
                address: &stranger,
                invoke: &MockAuthInvoke {
                    contract: &c.contract,
                    fn_name: "distribute",
                    args: (id, rules(5_000, 5_000, PERIOD)).into_val(e),
                    sub_invokes: &[],
                },
            }]);
            assert!(c.client.try_distribute(&id, &rules(5_000, 5_000, PERIOD)).is_err());
            assert_eq!(c.client.rewards_status(&id).current_period, 0);

            // Without changes, anyone can distribute: no signature at all.
            e.set_auths(&[]);
            c.client.distribute(&id, &None);
            assert_eq!(e.auths(), std::vec![]);
            assert_eq!(c.client.rewards_status(&id).vendor_pool_bps, 6_000);

            // With changes, exactly the operator signs.
            e.mock_all_auths();
            advance(&c, PERIOD);
            c.client.distribute(&id, &rules(5_000, 5_000, 90 * DAY));
            assert_eq!(
                e.auths(),
                std::vec![(
                    c.operator.clone(),
                    AuthorizedInvocation {
                        function: AuthorizedFunction::Contract((
                            c.contract.clone(),
                            Symbol::new(e, "distribute"),
                            (id, rules(5_000, 5_000, 90 * DAY)).into_val(e),
                        )),
                        sub_invocations: std::vec![],
                    }
                )]
            );
        }

        #[test]
        fn scheduled_rules_apply_at_the_next_distribution_without_a_signature() {
            let c = setup();
            let e = &c.env;
            let id = rewards_marketplace(&c);
            c.client.set_next_rules(&id, &rules(2_000, 8_000, 180 * DAY));
            assert_eq!(
                e.auths(),
                std::vec![(
                    c.operator.clone(),
                    AuthorizedInvocation {
                        function: AuthorizedFunction::Contract((
                            c.contract.clone(),
                            Symbol::new(e, "set_next_rules"),
                            (id, rules(2_000, 8_000, 180 * DAY)).into_val(e),
                        )),
                        sub_invocations: std::vec![],
                    }
                )]
            );
            assert_eq!(c.client.get_next_rules(&id), rules(2_000, 8_000, 180 * DAY));
            // The running period keeps its rules.
            assert_eq!(c.client.rewards_status(&id).vendor_pool_bps, 6_000);
            c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));

            // Anyone distributes, with no signature at all, and the schedule applies.
            advance(&c, PERIOD);
            e.set_auths(&[]);
            assert_eq!(c.client.distribute(&id, &None), 5 * USD);
            assert_eq!(e.auths(), std::vec![]);
            let status = c.client.rewards_status(&id);
            assert_eq!((status.vendor_pool_bps, status.period_seconds), (2_000, 180 * DAY));
            assert_eq!(c.client.get_period(&id, &0).vendor_pool_bps, 6_000);
            // Used up: the following distribution keeps the new rules.
            assert_eq!(c.client.get_next_rules(&id), None);
            advance(&c, 180 * DAY);
            c.client.distribute(&id, &None);
            assert_eq!(c.client.rewards_status(&id).vendor_pool_bps, 2_000);
        }

        #[test]
        fn scheduled_rules_need_the_operator_and_are_validated() {
            let c = setup();
            let e = &c.env;
            let id = rewards_marketplace(&c);
            let bad = Err(Ok(Error::InvalidRewardsConfig));
            assert_eq!(c.client.try_set_next_rules(&id, &rules(6_000, 3_000, PERIOD)), bad);
            assert_eq!(c.client.try_set_next_rules(&id, &rules(5_000, 5_000, MIN_PERIOD_SECONDS - 1)), bad);
            assert_eq!(c.client.get_next_rules(&id), None);

            // Strict auth: no signature, or a stranger's, is refused.
            e.set_auths(&[]);
            assert!(c.client.try_set_next_rules(&id, &rules(5_000, 5_000, PERIOD)).is_err());
            let stranger = Address::generate(e);
            e.mock_auths(&[MockAuth {
                address: &stranger,
                invoke: &MockAuthInvoke {
                    contract: &c.contract,
                    fn_name: "set_next_rules",
                    args: (id, rules(5_000, 5_000, PERIOD)).into_val(e),
                    sub_invokes: &[],
                },
            }]);
            assert!(c.client.try_set_next_rules(&id, &rules(5_000, 5_000, PERIOD)).is_err());
            assert_eq!(c.client.get_next_rules(&id), None);

            // The operator can clear a schedule.
            e.mock_all_auths();
            c.client.set_next_rules(&id, &rules(5_000, 5_000, PERIOD));
            c.client.set_next_rules(&id, &None);
            assert_eq!(c.client.get_next_rules(&id), None);

            // Rules passed to distribute win over a schedule, which is used up.
            c.client.set_next_rules(&id, &rules(1_000, 9_000, PERIOD));
            advance(&c, PERIOD);
            c.client.distribute(&id, &rules(3_000, 7_000, PERIOD));
            assert_eq!(c.client.rewards_status(&id).vendor_pool_bps, 3_000);
            assert_eq!(c.client.get_next_rules(&id), None);

            // Only rewards marketplaces have periods.
            let fund = Address::generate(e);
            let classic = c.client.create_marketplace(&c.operator, &fund, &8_800, &800, &200);
            assert_eq!(
                c.client.try_set_next_rules(&classic, &rules(5_000, 5_000, PERIOD)),
                Err(Ok(Error::RewardsNotEnabled))
            );
        }

        #[test]
        fn vendors_join_with_their_own_signature() {
            let c = setup();
            let e = &c.env;
            let id = c
                .client
                .create_rewards_marketplace(&c.operator, &8_800, &500, &500, &PERIOD, &6_000);
            assert_eq!(c.client.try_purchase(&id, &c.b1, &c.v1, &USD), Err(Ok(Error::VendorNotRegistered)));

            // Strict auth: no signature, or the operator's, is refused.
            e.set_auths(&[]);
            assert!(c.client.try_join(&id, &c.v1).is_err());
            e.mock_auths(&[MockAuth {
                address: &c.operator,
                invoke: &MockAuthInvoke {
                    contract: &c.contract,
                    fn_name: "join",
                    args: (id, &c.v1).into_val(e),
                    sub_invokes: &[],
                },
            }]);
            assert!(c.client.try_join(&id, &c.v1).is_err());

            // The vendor's own signature is enough, and exactly what's needed.
            e.mock_auths(&[MockAuth {
                address: &c.v1,
                invoke: &MockAuthInvoke {
                    contract: &c.contract,
                    fn_name: "join",
                    args: (id, &c.v1).into_val(e),
                    sub_invokes: &[],
                },
            }]);
            c.client.join(&id, &c.v1);
            e.mock_all_auths();
            c.client.join(&id, &c.v1); // twice is harmless
            assert_eq!(c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD)).vendor_amount, 88 * USD);
            assert_eq!(c.client.try_join(&99, &c.v1), Err(Ok(Error::MarketplaceNotFound)));
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
            // The length passing isn't enough: the period must be distributed.
            advance(&c, PERIOD);
            assert_eq!(c.client.try_claim(&id, &0, &c.b1), Err(Ok(Error::PeriodNotEnded)));

            c.client.distribute(&id, &None);
            assert!(c.client.get_reward(&id, &0, &c.b1).period_ended);
            assert_eq!(c.client.claim(&id, &0, &c.b1), 2 * USD);
            assert!(c.client.get_reward(&id, &0, &c.b1).claimed);
            assert_eq!(c.client.try_claim(&id, &0, &c.b1), Err(Ok(Error::AlreadyClaimed)));
            // Someone who neither sold nor bought in the period.
            assert_eq!(c.client.try_claim(&id, &0, &c.b2), Err(Ok(Error::NothingToClaim)));
            // A period without any sale has nothing for anyone.
            assert_eq!(c.client.try_claim(&id, &1, &c.b1), Err(Ok(Error::PeriodNotEnded)));
            end_period(&c, id);
            assert_eq!(c.client.try_claim(&id, &1, &c.b1), Err(Ok(Error::NothingToClaim)));
        }

        #[test]
        fn each_period_is_shared_among_its_own_participants() {
            let c = setup();
            let id = rewards_marketplace(&c);
            c.client.purchase(&id, &c.b1, &c.v1, &(200 * USD));
            end_period(&c, id);
            c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));
            c.client.purchase(&id, &c.b2, &c.v2, &(100 * USD));
            end_period(&c, id);
            assert_eq!(c.client.get_reward(&id, &0, &c.b1).amount, 4 * USD);
            assert_eq!(c.client.get_reward(&id, &1, &c.b1).amount, 2 * USD);
            assert_eq!(c.client.get_reward(&id, &1, &c.b2).amount, 2 * USD);
            assert_eq!(c.client.get_reward(&id, &0, &c.b2).amount, 0);
        }

        #[test]
        fn vendor_buying_from_itself_counts_on_both_sides() {
            let c = setup();
            let id = rewards_marketplace(&c);
            c.client.purchase(&id, &c.v1, &c.v1, &(100 * USD));
            let view = c.client.get_reward(&id, &0, &c.v1);
            assert_eq!((view.vendor_volume, view.buyer_volume), (100 * USD, 100 * USD));
            end_period(&c, id);
            assert_eq!(c.client.claim(&id, &0, &c.v1), 5 * USD);
        }

        /// Selling to yourself to win a bigger share of other people's pool
        /// always loses money: the operator and platform shares of the fake
        /// sales are gone for good, and the share taken from others is
        /// exactly cancelled by the share of its own contribution given away.
        #[test]
        fn wash_trading_never_pays() {
            let c = setup();
            for wash in [1, 50, 100, 1_000, 5_000] {
                let start = c.token.balance(&c.v1);
                let id = rewards_marketplace(&c);
                c.client.purchase(&id, &c.b1, &c.v2, &(100 * USD));
                c.client.purchase(&id, &c.v1, &c.v1, &(wash * USD));
                end_period(&c, id);
                c.client.claim(&id, &0, &c.v1);
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
            end_period(&c, id);
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
                end_period(&c, id);
                assert_eq!(c.client.get_reward(&id, &0, &c.v1).amount, vendor_gets);
                assert_eq!(c.client.get_reward(&id, &0, &c.b1).amount, buyer_gets);
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
            end_period(&c, id);
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
            c.client.distribute(&a, &None);
            assert_eq!(c.client.try_claim(&b, &0, &c.b2), Err(Ok(Error::PeriodNotEnded)));
            c.client.distribute(&b, &None);
            assert_eq!(c.client.try_claim(&a, &0, &c.b2), Err(Ok(Error::NothingToClaim)));
            assert_eq!(c.client.claim(&a, &0, &c.b1), 2 * USD);
            assert_eq!(c.client.claim(&b, &0, &c.b2), 6 * USD);
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
            end_period(&c, id);
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

            // b1 claiming with its own signature works.
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
            assert_eq!(c.client.try_distribute(&id, &None), Err(Ok(Error::RewardsNotEnabled)));
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

        /// Two $100 sales raise the $10 target.
        fn reach_target(f: &F) {
            let c = &f.c;
            assert_eq!(c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD)).round, Some(0));
            assert_eq!(c.client.try_release_fundraise(&f.id, &None), Err(Ok(Error::GoalNotReached)));
            c.client.purchase(&f.id, &c.b2, &c.v1, &(100 * USD));
        }

        fn assert_paid_out(f: &F, r1: i128, r2: i128) {
            assert_eq!(f.c.token.balance(&f.r1), r1);
            assert_eq!(f.c.token.balance(&f.r2), r2);
            assert_eq!(f.c.token.balance(&f.c.contract), 0);
        }

        #[test]
        fn raises_until_target_then_anyone_releases() {
            let f = fundraiser(GoalPolicy::Stop);
            let c = &f.c;
            c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD));
            let state = c.client.get_fundraise(&f.id);
            assert_eq!((state.raised, state.round, state.goal_reached, state.collecting), (5 * USD, 0, false, true));
            assert_eq!(c.token.balance(&c.contract), 5 * USD);
            c.client.purchase(&f.id, &c.b2, &c.v1, &(100 * USD));

            // Permissionless with the default next step: no signature at all.
            c.env.set_auths(&[]);
            assert_eq!(c.client.release_fundraise(&f.id, &None), 10 * USD);
            assert_eq!(c.env.auths(), std::vec![]);
            let state = c.client.get_fundraise(&f.id);
            assert_eq!((state.raised, state.round, state.goal_reached), (0, 1, true));
            assert_eq!((state.total_raised, state.total_released), (10 * USD, 10 * USD));
            assert_paid_out(&f, 7 * USD, 3 * USD);
        }

        #[test]
        fn release_pays_everything_raised_even_above_target() {
            let f = fundraiser(GoalPolicy::NewRound);
            let c = &f.c;
            c.client.purchase(&f.id, &c.b1, &c.v1, &(300 * USD)); // $15 raised
            assert_eq!(c.client.release_fundraise(&f.id, &None), 15 * USD);
            assert_paid_out(&f, 10 * USD + 5_000_000, 4 * USD + 5_000_000); // $10.50 / $4.50
        }

        #[test]
        fn stop_gives_later_community_shares_to_the_vendor() {
            let f = fundraiser(GoalPolicy::Stop);
            let c = &f.c;
            reach_target(&f);
            c.client.release_fundraise(&f.id, &None);
            assert!(!c.client.get_fundraise(&f.id).collecting);
            let vendor_before = c.token.balance(&c.v1);
            let receipt = c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD));
            assert_eq!(receipt.vendor_amount, 93 * USD);
            assert_eq!((receipt.community_amount, receipt.round), (0, None));
            assert_eq!(c.token.balance(&c.v1) - vendor_before, 93 * USD);
            assert_eq!(c.token.balance(&c.contract), 0);
            assert_eq!(c.client.try_release_fundraise(&f.id, &None), Err(Ok(Error::GoalNotReached)));
        }

        #[test]
        fn new_round_raises_again_toward_the_same_target() {
            let f = fundraiser(GoalPolicy::NewRound);
            let c = &f.c;
            reach_target(&f);
            c.client.release_fundraise(&f.id, &None);
            assert_eq!(c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD)).round, Some(1));
            assert_eq!(c.client.try_release_fundraise(&f.id, &None), Err(Ok(Error::GoalNotReached)));
            c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD));
            assert_eq!(c.client.release_fundraise(&f.id, &None), 10 * USD);
            assert_paid_out(&f, 14 * USD, 6 * USD);
            assert_eq!(c.client.get_fundraise(&f.id).round, 2);
        }

        #[test]
        fn operator_picks_the_next_target_or_stops() {
            let f = fundraiser(GoalPolicy::NewRound);
            let c = &f.c;
            reach_target(&f);
            // A new $20 target for round 2.
            c.client.release_fundraise(&f.id, &Some(20 * USD));
            assert_eq!(
                c.env.auths(),
                std::vec![(
                    c.operator.clone(),
                    AuthorizedInvocation {
                        function: AuthorizedFunction::Contract((
                            c.contract.clone(),
                            Symbol::new(&c.env, "release_fundraise"),
                            (f.id, Some(20 * USD)).into_val(&c.env),
                        )),
                        sub_invocations: std::vec![],
                    }
                )]
            );
            let state = c.client.get_fundraise(&f.id);
            assert_eq!((state.target, state.round, state.collecting), (20 * USD, 1, true));
            for _ in 0..3 {
                c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD));
            }
            assert_eq!(c.client.try_release_fundraise(&f.id, &None), Err(Ok(Error::GoalNotReached)));
            c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD));
            // A next target of 0 stops fundraising, even with NewRound.
            assert_eq!(c.client.release_fundraise(&f.id, &Some(0)), 20 * USD);
            assert!(!c.client.get_fundraise(&f.id).collecting);
            assert_eq!(c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD)).community_amount, 0);
            assert_paid_out(&f, 21 * USD, 9 * USD);
        }

        #[test]
        fn scheduled_target_applies_at_the_next_release() {
            let f = fundraiser(GoalPolicy::Stop);
            let c = &f.c;
            let e = &c.env;
            c.client.set_next_target(&f.id, &Some(20 * USD));
            assert_eq!(
                e.auths(),
                std::vec![(
                    c.operator.clone(),
                    AuthorizedInvocation {
                        function: AuthorizedFunction::Contract((
                            c.contract.clone(),
                            Symbol::new(e, "set_next_target"),
                            (f.id, Some(20 * USD)).into_val(e),
                        )),
                        sub_invocations: std::vec![],
                    }
                )]
            );
            assert_eq!(c.client.get_next_target(&f.id), Some(20 * USD));
            // The running round keeps its target.
            assert_eq!(c.client.get_fundraise(&f.id).target, 10 * USD);
            reach_target(&f);

            // Anyone releases, with no signature at all, and the schedule applies
            // (overriding the Stop policy).
            e.set_auths(&[]);
            assert_eq!(c.client.release_fundraise(&f.id, &None), 10 * USD);
            assert_eq!(e.auths(), std::vec![]);
            let state = c.client.get_fundraise(&f.id);
            assert_eq!((state.target, state.round, state.collecting), (20 * USD, 1, true));
            assert_eq!(c.client.get_next_target(&f.id), None);

            // A scheduled 0 stops fundraising after the round.
            e.mock_all_auths();
            c.client.set_next_target(&f.id, &Some(0));
            for _ in 0..4 {
                c.client.purchase(&f.id, &c.b1, &c.v1, &(100 * USD));
            }
            e.set_auths(&[]);
            c.client.release_fundraise(&f.id, &None);
            assert!(!c.client.get_fundraise(&f.id).collecting);
            assert_paid_out(&f, 21 * USD, 9 * USD);
            // Nothing left to schedule once stopped.
            e.mock_all_auths();
            assert_eq!(c.client.try_set_next_target(&f.id, &Some(5 * USD)), Err(Ok(Error::InvalidGoal)));
        }

        #[test]
        fn scheduled_target_needs_the_operator_and_cant_be_negative() {
            let f = fundraiser(GoalPolicy::NewRound);
            let c = &f.c;
            let e = &c.env;
            assert_eq!(c.client.try_set_next_target(&f.id, &Some(-1)), Err(Ok(Error::InvalidGoal)));
            e.set_auths(&[]);
            assert!(c.client.try_set_next_target(&f.id, &Some(5 * USD)).is_err());
            let stranger = Address::generate(e);
            e.mock_auths(&[MockAuth {
                address: &stranger,
                invoke: &MockAuthInvoke {
                    contract: &c.contract,
                    fn_name: "set_next_target",
                    args: (f.id, Some(5 * USD)).into_val(e),
                    sub_invokes: &[],
                },
            }]);
            assert!(c.client.try_set_next_target(&f.id, &Some(5 * USD)).is_err());
            assert_eq!(c.client.get_next_target(&f.id), None);

            // Cleared schedules fall back to the policy; a target passed to the
            // release wins over a schedule, which is used up.
            e.mock_all_auths();
            c.client.set_next_target(&f.id, &Some(5 * USD));
            c.client.set_next_target(&f.id, &None);
            assert_eq!(c.client.get_next_target(&f.id), None);
            c.client.set_next_target(&f.id, &Some(5 * USD));
            reach_target(&f);
            c.client.release_fundraise(&f.id, &Some(30 * USD));
            assert_eq!(c.client.get_fundraise(&f.id).target, 30 * USD);
            assert_eq!(c.client.get_next_target(&f.id), None);
        }

        #[test]
        fn next_target_needs_the_operator_and_cant_be_negative() {
            let f = fundraiser(GoalPolicy::Stop);
            let c = &f.c;
            reach_target(&f);
            assert_eq!(c.client.try_release_fundraise(&f.id, &Some(-1)), Err(Ok(Error::InvalidGoal)));
            let e = &c.env;
            e.set_auths(&[]);
            assert!(c.client.try_release_fundraise(&f.id, &Some(5 * USD)).is_err());
            let stranger = Address::generate(e);
            e.mock_auths(&[MockAuth {
                address: &stranger,
                invoke: &MockAuthInvoke {
                    contract: &c.contract,
                    fn_name: "release_fundraise",
                    args: (f.id, Some(5 * USD)).into_val(e),
                    sub_invokes: &[],
                },
            }]);
            assert!(c.client.try_release_fundraise(&f.id, &Some(5 * USD)).is_err());
            assert_eq!(c.client.get_fundraise(&f.id).raised, 10 * USD);
            // The operator can revive a Stop fundraiser with a new target.
            e.mock_all_auths();
            c.client.release_fundraise(&f.id, &Some(5 * USD));
            let state = c.client.get_fundraise(&f.id);
            assert_eq!((state.target, state.collecting), (5 * USD, true));
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
            assert_eq!(c.client.release_fundraise(&id, &None), raised);
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
            // Below target, nothing can be released, not even by the operator.
            c.env.mock_all_auths();
            assert_eq!(c.client.try_release_fundraise(&f.id, &None), Err(Ok(Error::GoalNotReached)));
            assert_eq!(c.client.try_release_fundraise(&f.id, &Some(USD)), Err(Ok(Error::GoalNotReached)));
            assert_eq!(c.token.balance(&c.contract), held);
            // Rewards entry points don't apply to a fundraiser and vice versa.
            assert_eq!(c.client.try_claim(&f.id, &0, &c.b1), Err(Ok(Error::RewardsNotEnabled)));
            assert_eq!(c.client.try_distribute(&f.id, &None), Err(Ok(Error::RewardsNotEnabled)));
            let rewards = rewards_marketplace(c);
            assert_eq!(c.client.try_release_fundraise(&rewards, &None), Err(Ok(Error::FundraiseNotEnabled)));
        }

        #[test]
        fn rules_are_public() {
            let f = fundraiser(GoalPolicy::NewRound);
            let state = f.c.client.get_fundraise(&f.id);
            assert_eq!(state.target, 10 * USD);
            assert_eq!(state.recipients, vec![&f.c.env, f.r1.clone(), f.r2.clone()]);
            assert_eq!(state.shares_bps, vec![&f.c.env, 7_000u32, 3_000]);
            assert_eq!(state.policy, GoalPolicy::NewRound);
        }
    }

    mod upgrade {
        use super::*;

        /// Calls keep the (small) instance alive but never extend the code,
        /// whose rent would otherwise land on a buyer's transaction.
        #[test]
        fn calls_extend_the_instance_but_not_the_code() {
            use soroban_sdk::testutils::Deployer as _;
            let c = setup();
            let id = rewards_marketplace(&c);
            let e = &c.env;
            c.client.purchase(&id, &c.b1, &c.v1, &(100 * USD));
            // The instance was below the threshold at registration and got
            // the full extension; the code kept its initial, shorter TTL.
            assert_eq!(e.deployer().get_contract_instance_ttl(&c.contract), 30 * 17_280);
            assert!(e.deployer().get_contract_code_ttl(&c.contract) < 25 * 17_280);
        }

        #[test]
        fn only_the_admin_can_upgrade() {
            let c = setup();
            let e = &c.env;
            assert_eq!(c.client.version(), CONTRACT_VERSION);
            assert_eq!(c.client.get_admin(), c.admin);
            let hash = BytesN::from_array(e, &[7; 32]);
            for who in [&c.operator, &c.b1] {
                e.mock_auths(&[MockAuth {
                    address: who,
                    invoke: &MockAuthInvoke {
                        contract: &c.contract,
                        fn_name: "upgrade",
                        args: (hash.clone(),).into_val(e),
                        sub_invokes: &[],
                    },
                }]);
                assert!(c.client.try_upgrade(&hash).is_err());
            }
            e.set_auths(&[]);
            assert!(c.client.try_upgrade(&hash).is_err());

            // With the admin's signature the code is replaced, keeping the
            // address and the stored marketplaces. Uses the release build of
            // this contract when it exists (cargo build --target wasm32v1-none --release).
            let wasm_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/wasm32v1-none/release/compaki_marketplace.wasm");
            let Ok(bytes) = std::fs::read(wasm_path) else {
                std::println!("skipping the upgrade itself: build the wasm first");
                return;
            };
            e.mock_all_auths();
            let id = rewards_marketplace(&c);
            let uploaded = e.deployer().upload_contract_wasm(soroban_sdk::Bytes::from_slice(e, &bytes));
            c.client.upgrade(&uploaded);
            assert_eq!(e.auths()[0].0, c.admin);
            assert_eq!(c.client.version(), CONTRACT_VERSION);
            assert_eq!(c.client.get_marketplace(&id).operator, c.operator);
            assert_eq!(c.client.rewards_status(&id).vendor_pool_bps, 6_000);
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
