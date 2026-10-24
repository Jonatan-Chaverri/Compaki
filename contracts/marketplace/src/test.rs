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

// ─── Community Rewards ──────────────────────────────────────────────────────
//
// Setup uses mock_all_auths() for convenience on the happy path only. Every
// authorization claim is verified separately: positive paths assert the exact
// `env.auths()` that was required, and negative paths switch to strict mode
// (`set_auths(&[])` / targeted `mock_auths`) so a missing signature really
// fails.

mod rewards {
    use super::super::*;
    use super::std;
    use soroban_sdk::{
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Ledger, MockAuth, MockAuthInvoke},
        token::{Client as TokenClient, StellarAssetClient},
        vec, Address, Env, IntoVal, Symbol, Vec,
    };

    const HOUR: u64 = 3_600;
    const T0: u64 = 1_700_000_000;

    struct R<'a> {
        env: Env,
        contract: Address,
        client: MarketplaceContractClient<'a>,
        token: TokenClient<'a>,
        token_admin: StellarAssetClient<'a>,
        admin: Address,
        operator: Address,
        vendor: Address,
        buyer: Address,
        a: Address,
        b: Address,
        c: Address,
        /// Rewards marketplace, 90% vendor / 5% operator / 5% community.
        id: u64,
    }

    fn setup<'a>() -> R<'a> {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(T0);

        let issuer = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(issuer);
        let token = TokenClient::new(&env, &sac.address());
        let token_admin = StellarAssetClient::new(&env, &sac.address());

        let contract = env.register_contract(None, MarketplaceContract);
        let client = MarketplaceContractClient::new(&env, &contract);
        let admin = Address::generate(&env);
        client.initialize(&admin, &sac.address());

        let operator = Address::generate(&env);
        let vendor = Address::generate(&env);
        let buyer = Address::generate(&env);
        let id = client.create_rewards_marketplace(&operator, &9_000, &500, &500);
        client.register_vendor(&id, &vendor);
        token_admin.mint(&buyer, &1_000_000_000_000);

        R {
            a: Address::generate(&env),
            b: Address::generate(&env),
            c: Address::generate(&env),
            env,
            contract,
            client,
            token,
            token_admin,
            admin,
            operator,
            vendor,
            buyer,
            id,
        }
    }

    /// Opens a 50/30/20 period for members a/b/c ending in one hour.
    fn open_abc(r: &R) -> u32 {
        r.client.open_period(
            &r.id,
            &vec![&r.env, r.a.clone(), r.b.clone(), r.c.clone()],
            &vec![&r.env, 5_000u32, 3_000, 2_000],
            &(r.env.ledger().timestamp() + HOUR),
        )
    }

    fn advance(r: &R, seconds: u64) {
        let now = r.env.ledger().timestamp();
        r.env.ledger().set_timestamp(now + seconds);
    }

    // 1. Purchase splits vendor / operator / treasury.
    #[test]
    fn purchase_funds_vendor_operator_and_treasury() {
        let r = setup();
        let pid = open_abc(&r);

        // $100.00 → 90 / 5 / 5.
        let booked = r.client.purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000);
        assert_eq!(booked, Some(pid));

        assert_eq!(r.token.balance(&r.vendor), 900_000_000);
        assert_eq!(r.token.balance(&r.operator), 50_000_000);
        // Community share sits in the contract, not in any operator/admin account.
        assert_eq!(r.token.balance(&r.contract), 50_000_000);
        assert_eq!(r.client.get_period(&r.id, &pid).total_contributed, 50_000_000);
        assert_eq!(r.client.rewards_status(&r.id).total_contributed, 50_000_000);
        // On-chain config shows the contract itself as the community fund.
        assert_eq!(r.client.get_marketplace(&r.id).community_fund, r.contract);
    }

    // 2. Several purchases accumulate in the same period.
    #[test]
    fn contributions_accumulate_within_period() {
        let r = setup();
        let pid = open_abc(&r);
        r.client.purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000); // +50_000_000
        advance(&r, 60);
        r.client.purchase(&r.id, &r.buyer, &r.vendor, &200_000_000); // +10_000_000
        r.client.purchase(&r.id, &r.buyer, &r.vendor, &101); // 90, 5, community 6 (dust)

        let period = r.client.get_period(&r.id, &pid);
        assert_eq!(period.total_contributed, 60_000_006);
        assert_eq!(r.token.balance(&r.contract), 60_000_006);
    }

    // 3. + 4. + 5. Close after end, fixed-share allocation, successful claims.
    #[test]
    fn close_allocates_fixed_shares_and_members_claim() {
        let r = setup();
        let pid = open_abc(&r);
        r.client.purchase(&r.id, &r.buyer, &r.vendor, &2_000_000_000); // community 100_000_000
        advance(&r, HOUR);

        assert_eq!(r.client.close_period(&r.id, &pid), 100_000_000);
        assert!(r.client.get_period(&r.id, &pid).closed);

        let ents = r.client.get_entitlements(&r.id, &pid);
        assert_eq!(ents.len(), 3);
        assert_eq!(ents.get(0).unwrap().amount, 50_000_000);
        assert_eq!(ents.get(1).unwrap().amount, 30_000_000);
        assert_eq!(ents.get(2).unwrap().amount, 20_000_000);

        assert_eq!(r.client.claim(&r.id, &pid, &r.a), 50_000_000);
        assert_eq!(r.client.claim(&r.id, &pid, &r.b), 30_000_000);
        assert_eq!(r.client.claim(&r.id, &pid, &r.c), 20_000_000);
        assert_eq!(r.token.balance(&r.a), 50_000_000);
        assert_eq!(r.token.balance(&r.b), 30_000_000);
        assert_eq!(r.token.balance(&r.c), 20_000_000);
        assert_eq!(r.token.balance(&r.contract), 0);
        assert!(r.client.get_entitlement(&r.id, &pid, &r.a).claimed);

        let status = r.client.rewards_status(&r.id);
        assert_eq!(status.total_contributed, status.total_claimed);
    }

    // 6. Second claim is rejected and moves no money.
    #[test]
    fn second_claim_rejected() {
        let r = setup();
        let pid = open_abc(&r);
        r.client.purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000);
        advance(&r, HOUR);
        r.client.close_period(&r.id, &pid);
        r.client.claim(&r.id, &pid, &r.a);
        let before = r.token.balance(&r.contract);

        assert_eq!(
            r.client.try_claim(&r.id, &pid, &r.a),
            Err(Ok(Error::AlreadyClaimed))
        );
        assert_eq!(r.token.balance(&r.contract), before);
    }

    // 7. Claiming from an open period is rejected.
    #[test]
    fn claim_before_close_rejected() {
        let r = setup();
        let pid = open_abc(&r);
        r.client.purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000);
        assert_eq!(
            r.client.try_claim(&r.id, &pid, &r.a),
            Err(Ok(Error::PeriodNotClosed))
        );
        // Still rejected after the end date until someone closes it.
        advance(&r, HOUR);
        assert_eq!(
            r.client.try_claim(&r.id, &pid, &r.a),
            Err(Ok(Error::PeriodNotClosed))
        );
        assert_eq!(
            r.client.try_get_entitlements(&r.id, &pid),
            Err(Ok(Error::PeriodNotClosed))
        );
    }

    // 8. Closing before the ledger reaches end_ts is rejected.
    #[test]
    fn premature_close_rejected() {
        let r = setup();
        let pid = open_abc(&r);
        advance(&r, HOUR - 1);
        assert_eq!(
            r.client.try_close_period(&r.id, &pid),
            Err(Ok(Error::PeriodNotEnded))
        );
        advance(&r, 1);
        r.client.close_period(&r.id, &pid);
        // And a closed period can't be closed (re-allocated) again.
        assert_eq!(
            r.client.try_close_period(&r.id, &pid),
            Err(Ok(Error::PeriodAlreadyClosed))
        );
    }

    // 9. Committed shares cannot be modified.
    #[test]
    fn committed_shares_cannot_be_modified() {
        let r = setup();
        let pid = open_abc(&r);
        r.client.purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000);
        let committed = r.client.get_period(&r.id, &pid);

        // The operator tries to replace the running period's rules with a
        // 100% allocation to a new address.
        let attacker = Address::generate(&r.env);
        let attempt = r.client.try_open_period(
            &r.id,
            &vec![&r.env, attacker.clone()],
            &vec![&r.env, 10_000u32],
            &(r.env.ledger().timestamp() + HOUR),
        );
        assert_eq!(attempt, Err(Ok(Error::PeriodActive)));
        assert_eq!(r.client.get_period(&r.id, &pid), committed);

        // After the end, a NEW period may be opened, but it is a separate
        // period: the ended one keeps its rules and contributions.
        advance(&r, HOUR);
        let next = r.client.open_period(
            &r.id,
            &vec![&r.env, attacker.clone()],
            &vec![&r.env, 10_000u32],
            &(r.env.ledger().timestamp() + HOUR),
        );
        assert_eq!(next, pid + 1);
        assert_eq!(r.client.get_period(&r.id, &pid), committed);
        r.client.close_period(&r.id, &pid);
        assert_eq!(
            r.client.try_claim(&r.id, &pid, &attacker),
            Err(Ok(Error::NotBeneficiary))
        );
        assert_eq!(r.client.claim(&r.id, &pid, &r.a), 25_000_000);
    }

    // Purchases with no active period fail atomically (no silent fallback).
    #[test]
    fn purchase_without_active_period_rejected() {
        let r = setup();
        // No period opened yet.
        assert_eq!(
            r.client.try_purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000),
            Err(Ok(Error::NoActivePeriod))
        );
        let pid = open_abc(&r);
        advance(&r, HOUR); // expired, not closed
        assert_eq!(
            r.client.try_purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000),
            Err(Ok(Error::NoActivePeriod))
        );
        r.client.close_period(&r.id, &pid);
        assert_eq!(
            r.client.try_purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000),
            Err(Ok(Error::NoActivePeriod))
        );
        // Nothing moved, nothing booked.
        assert_eq!(r.token.balance(&r.buyer), 1_000_000_000_000);
        assert_eq!(r.token.balance(&r.vendor), 0);
        assert_eq!(r.token.balance(&r.contract), 0);
        assert_eq!(r.client.get_period(&r.id, &pid).total_contributed, 0);
    }

    // 10. Neither the contract admin nor the operator can move treasury funds.
    #[test]
    fn admin_and_operator_cannot_withdraw_treasury() {
        let r = setup();
        let pid = open_abc(&r);
        r.client.purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000);
        advance(&r, HOUR);
        r.client.close_period(&r.id, &pid);
        let treasury = r.token.balance(&r.contract);
        assert_eq!(treasury, 50_000_000);

        // (a) Neither can claim: they are not beneficiaries.
        assert_eq!(
            r.client.try_claim(&r.id, &pid, &r.admin),
            Err(Ok(Error::NotBeneficiary))
        );
        assert_eq!(
            r.client.try_claim(&r.id, &pid, &r.operator),
            Err(Ok(Error::NotBeneficiary))
        );

        // (b) The operator cannot list itself as a beneficiary.
        advance(&r, 1);
        assert_eq!(
            r.client.try_open_period(
                &r.id,
                &vec![&r.env, r.operator.clone()],
                &vec![&r.env, 10_000u32],
                &(r.env.ledger().timestamp() + HOUR),
            ),
            Err(Ok(Error::InvalidBeneficiaries))
        );

        // (c) Going around the contract: a token transfer out of the contract
        //     authorized by the admin and the operator (strict auth mode).
        //     Positive control first: the same harness lets the operator move
        //     its OWN funds, so the failures below are about whose funds move.
        r.env.mock_auths(&[MockAuth {
            address: &r.operator,
            invoke: &MockAuthInvoke {
                contract: &r.token.address,
                fn_name: "transfer",
                args: (&r.operator, &r.admin, 1i128).into_val(&r.env),
                sub_invokes: &[],
            },
        }]);
        r.token.transfer(&r.operator, &r.admin, &1);
        for thief in [&r.admin, &r.operator] {
            r.env.mock_auths(&[MockAuth {
                address: thief,
                invoke: &MockAuthInvoke {
                    contract: &r.token.address,
                    fn_name: "transfer",
                    args: (&r.contract, thief, treasury).into_val(&r.env),
                    sub_invokes: &[],
                },
            }]);
            let res = r.token.try_transfer(&r.contract, thief, &treasury);
            assert!(res.is_err(), "transfer out of the treasury must fail");
        }

        // (d) The operator signing a claim on behalf of a member fails: the
        //     member's own signature is required.
        r.env.mock_auths(&[MockAuth {
            address: &r.operator,
            invoke: &MockAuthInvoke {
                contract: &r.contract,
                fn_name: "claim",
                args: (r.id, pid, &r.a).into_val(&r.env),
                sub_invokes: &[],
            },
        }]);
        assert!(r.client.try_claim(&r.id, &pid, &r.a).is_err());

        assert_eq!(r.token.balance(&r.contract), treasury);
        assert_eq!(r.token.balance(&r.admin), 1); // the control transfer only
        assert_eq!(r.token.balance(&r.operator), 50_000_000 - 1); // its sale share
    }

    // 11. Two marketplaces sharing one contract balance stay isolated.
    #[test]
    fn marketplaces_are_isolated() {
        let r = setup();
        let op2 = Address::generate(&r.env);
        let vendor2 = Address::generate(&r.env);
        let id2 = r.client.create_rewards_marketplace(&op2, &8_000, &1_000, &1_000);
        r.client.register_vendor(&id2, &vendor2);

        let p1 = open_abc(&r);
        let x = Address::generate(&r.env);
        let p2 = r.client.open_period(
            &id2,
            &vec![&r.env, x.clone()],
            &vec![&r.env, 10_000u32],
            &(T0 + HOUR),
        );
        assert_eq!((p1, p2), (0, 0)); // same period id, different marketplaces

        r.client.purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000); // +50_000_000 to mkt 1
        r.client.purchase(&id2, &r.buyer, &vendor2, &1_000_000_000); // +100_000_000 to mkt 2
        assert_eq!(r.token.balance(&r.contract), 150_000_000);
        assert_eq!(r.client.get_period(&r.id, &p1).total_contributed, 50_000_000);
        assert_eq!(r.client.get_period(&id2, &p2).total_contributed, 100_000_000);

        // Vendor of marketplace 1 is not registered in marketplace 2.
        assert_eq!(
            r.client.try_purchase(&id2, &r.buyer, &r.vendor, &1_000),
            Err(Ok(Error::VendorNotRegistered))
        );

        advance(&r, HOUR);
        r.client.close_period(&r.id, &p1);
        r.client.close_period(&id2, &p2);

        // Members of one marketplace can't claim the other's period.
        assert_eq!(r.client.try_claim(&id2, &p2, &r.a), Err(Ok(Error::NotBeneficiary)));
        assert_eq!(r.client.try_claim(&r.id, &p1, &x), Err(Ok(Error::NotBeneficiary)));

        assert_eq!(r.client.claim(&id2, &p2, &x), 100_000_000);
        // Marketplace 1's funds are untouched by marketplace 2's payout.
        assert_eq!(r.token.balance(&r.contract), 50_000_000);
        assert_eq!(r.client.rewards_status(&r.id).total_claimed, 0);
        assert_eq!(r.client.claim(&r.id, &p1, &r.a), 25_000_000);
        assert_eq!(r.client.claim(&r.id, &p1, &r.b), 15_000_000);
        assert_eq!(r.client.claim(&r.id, &p1, &r.c), 10_000_000);
        assert_eq!(r.token.balance(&r.contract), 0);
    }

    // 12. Consecutive periods of one marketplace keep separate books.
    #[test]
    fn periods_are_isolated() {
        let r = setup();
        let p0 = open_abc(&r);
        r.client.purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000); // 50_000_000 → p0
        advance(&r, HOUR);

        let d = Address::generate(&r.env);
        let p1 = r.client.open_period(
            &r.id,
            &vec![&r.env, d.clone()],
            &vec![&r.env, 10_000u32],
            &(r.env.ledger().timestamp() + HOUR),
        );
        assert_eq!(r.client.purchase(&r.id, &r.buyer, &r.vendor, &400_000_000), Some(p1)); // 20_000_000 → p1

        assert_eq!(r.client.get_period(&r.id, &p0).total_contributed, 50_000_000);
        assert_eq!(r.client.get_period(&r.id, &p1).total_contributed, 20_000_000);

        // p0 can close while p1 is running; p1 cannot.
        r.client.close_period(&r.id, &p0);
        assert_eq!(r.client.try_close_period(&r.id, &p1), Err(Ok(Error::PeriodNotEnded)));
        // d is a member of p1 only.
        assert_eq!(r.client.try_claim(&r.id, &p0, &d), Err(Ok(Error::NotBeneficiary)));
        assert_eq!(r.client.try_claim(&r.id, &p1, &r.a), Err(Ok(Error::PeriodNotClosed)));

        advance(&r, HOUR);
        r.client.close_period(&r.id, &p1);
        assert_eq!(r.client.claim(&r.id, &p1, &d), 20_000_000);
        assert_eq!(r.client.try_claim(&r.id, &p1, &r.a), Err(Ok(Error::NotBeneficiary)));
        assert_eq!(r.client.claim(&r.id, &p0, &r.a), 25_000_000);
        assert_eq!(r.client.get_period(&r.id, &p0).total_claimed, 25_000_000);
        assert_eq!(r.client.get_period(&r.id, &p1).total_claimed, 20_000_000);
    }

    // 13. Rounding: entitlements always sum to exactly the period total.
    #[test]
    fn rounding_distributes_every_stroop() {
        let r = setup();
        let pid = r.client.open_period(
            &r.id,
            &vec![&r.env, r.a.clone(), r.b.clone(), r.c.clone()],
            &vec![&r.env, 3_333u32, 3_333, 3_334],
            &(T0 + HOUR),
        );
        // community = 200 - 180 - 10 = 10 stroops.
        r.client.purchase(&r.id, &r.buyer, &r.vendor, &200);
        advance(&r, HOUR);
        r.client.close_period(&r.id, &pid);

        // floor(10 * 3333 / 10000) = 3, 3, floor(10 * 3334 / 10000) = 3 → 9;
        // the 1 leftover stroop goes to the first member.
        let ents = r.client.get_entitlements(&r.id, &pid);
        let amounts: std::vec::Vec<i128> = ents.iter().map(|e| e.amount).collect();
        assert_eq!(amounts, std::vec![4, 3, 3]);

        for m in [&r.a, &r.b, &r.c] {
            r.client.claim(&r.id, &pid, m);
        }
        assert_eq!(r.token.balance(&r.contract), 0); // no inaccessible residue
        let p = r.client.get_period(&r.id, &pid);
        assert_eq!(p.total_claimed, p.total_contributed);
    }

    #[test]
    fn rounding_holds_for_awkward_totals() {
        // Property-style sweep: for many totals and a 7-way uneven split the
        // entitlements sum exactly to the total and each is within 1 stroop of
        // its exact proportional share.
        let shares: [u32; 7] = [1, 1_999, 2_500, 1_234, 3_000, 766, 500];
        for total in [1i128, 6, 7, 13, 9_999, 10_001, 123_456_789, 999_999_999_999] {
            let r = setup();
            let members: std::vec::Vec<Address> =
                (0..shares.len()).map(|_| Address::generate(&r.env)).collect();
            let mut bvec: Vec<Address> = Vec::new(&r.env);
            let mut svec: Vec<u32> = Vec::new(&r.env);
            for (m, s) in members.iter().zip(shares.iter()) {
                bvec.push_back(m.clone());
                svec.push_back(*s);
            }
            let pid = r.client.open_period(&r.id, &bvec, &svec, &(T0 + HOUR));
            // Mint and buy so the community share is exactly `total`
            // (community bps = 5% → buy 20x total).
            r.token_admin.mint(&r.buyer, &(total * 20));
            r.client.purchase(&r.id, &r.buyer, &r.vendor, &(total * 20));
            assert_eq!(r.client.get_period(&r.id, &pid).total_contributed, total);
            advance(&r, HOUR);
            r.client.close_period(&r.id, &pid);

            let ents = r.client.get_entitlements(&r.id, &pid);
            let sum: i128 = ents.iter().map(|e| e.amount).sum();
            assert_eq!(sum, total);
            for e in ents.iter() {
                let exact = total * e.share_bps as i128;
                let diff = e.amount * 10_000 - exact;
                assert!(diff > -10_000 && diff < 10_000, "within one stroop");
            }
        }
    }

    // 14. Invalid configurations are rejected.
    #[test]
    fn invalid_configurations_rejected() {
        let r = setup();
        let e = &r.env;
        let end = T0 + HOUR;
        let bad = |members: Vec<Address>, shares: Vec<u32>| {
            r.client.try_open_period(&r.id, &members, &shares, &end)
        };
        let invalid = Err(Ok(Error::InvalidBeneficiaries));

        // Empty list.
        assert_eq!(bad(Vec::new(e), Vec::new(e)), invalid);
        // Length mismatch.
        assert_eq!(bad(vec![e, r.a.clone()], vec![e, 5_000u32, 5_000]), invalid);
        // Shares don't sum to 10_000 (under / over).
        assert_eq!(bad(vec![e, r.a.clone(), r.b.clone()], vec![e, 5_000u32, 4_999]), invalid);
        assert_eq!(bad(vec![e, r.a.clone(), r.b.clone()], vec![e, 5_000u32, 5_001]), invalid);
        // u32 overflow must not wrap into a valid sum.
        assert_eq!(
            bad(vec![e, r.a.clone(), r.b.clone()], vec![e, u32::MAX, 10_001]),
            invalid
        );
        // Zero share.
        assert_eq!(
            bad(vec![e, r.a.clone(), r.b.clone()], vec![e, 10_000u32, 0]),
            invalid
        );
        // Duplicate member.
        assert_eq!(
            bad(vec![e, r.a.clone(), r.a.clone()], vec![e, 5_000u32, 5_000]),
            invalid
        );
        // Forbidden addresses: the operator and the contract itself.
        assert_eq!(bad(vec![e, r.operator.clone()], vec![e, 10_000u32]), invalid);
        assert_eq!(bad(vec![e, r.contract.clone()], vec![e, 10_000u32]), invalid);
        // More than MAX_BENEFICIARIES.
        let mut many: Vec<Address> = Vec::new(e);
        let mut many_shares: Vec<u32> = Vec::new(e);
        for i in 0..(MAX_BENEFICIARIES + 1) {
            many.push_back(Address::generate(e));
            many_shares.push_back(if i == 0 { 10_000 - MAX_BENEFICIARIES } else { 1 });
        }
        assert_eq!(bad(many, many_shares), invalid);
        // Exactly MAX_BENEFICIARIES is fine (checked last so state stays clean above).

        // End date in the past / now / too far in the future.
        let one = || vec![e, r.a.clone()];
        let full = || vec![e, 10_000u32];
        assert_eq!(
            r.client.try_open_period(&r.id, &one(), &full(), &T0),
            Err(Ok(Error::InvalidPeriodEnd))
        );
        assert_eq!(
            r.client.try_open_period(&r.id, &one(), &full(), &(T0 - 1)),
            Err(Ok(Error::InvalidPeriodEnd))
        );
        assert_eq!(
            r.client
                .try_open_period(&r.id, &one(), &full(), &(T0 + MAX_PERIOD_SECONDS + 1)),
            Err(Ok(Error::InvalidPeriodEnd))
        );

        // Rewards functions on a classic marketplace.
        let fund = Address::generate(e);
        let classic = r
            .client
            .create_marketplace(&r.operator, &fund, &9_000, &500, &500);
        assert_eq!(
            r.client.try_open_period(&classic, &one(), &full(), &end),
            Err(Ok(Error::RewardsNotEnabled))
        );
        assert_eq!(
            r.client.try_rewards_status(&classic),
            Err(Ok(Error::RewardsNotEnabled))
        );
        assert_eq!(
            r.client.try_open_period(&99, &one(), &full(), &end),
            Err(Ok(Error::MarketplaceNotFound))
        );
        // Rewards marketplace with a 0% community share / a bad split.
        assert_eq!(
            r.client.try_create_rewards_marketplace(&r.operator, &9_000, &1_000, &0),
            Err(Ok(Error::InvalidSplit))
        );
        assert_eq!(
            r.client.try_create_rewards_marketplace(&r.operator, &9_000, &1_000, &1),
            Err(Ok(Error::InvalidSplit))
        );
        // Classic marketplace pointing its fund at the contract (would strand funds).
        assert_eq!(
            r.client
                .try_create_marketplace(&r.operator, &r.contract, &9_000, &500, &500),
            Err(Ok(Error::InvalidAddress))
        );
        // Unknown period ids.
        assert_eq!(r.client.try_close_period(&r.id, &7), Err(Ok(Error::PeriodNotFound)));
        assert_eq!(r.client.try_claim(&r.id, &7, &r.a), Err(Ok(Error::PeriodNotFound)));

        // Nothing above opened a period.
        assert_eq!(r.client.rewards_status(&r.id).period_count, 0);

        // MAX_BENEFICIARIES exactly is accepted.
        let mut max: Vec<Address> = Vec::new(e);
        let mut max_shares: Vec<u32> = Vec::new(e);
        for _ in 0..MAX_BENEFICIARIES {
            max.push_back(Address::generate(e));
            max_shares.push_back(BPS_DENOM / MAX_BENEFICIARIES);
        }
        r.client.open_period(&r.id, &max, &max_shares, &end);
    }

    #[test]
    fn empty_period_has_nothing_to_claim() {
        let r = setup();
        let pid = open_abc(&r);
        advance(&r, HOUR);
        assert_eq!(r.client.close_period(&r.id, &pid), 0);
        assert_eq!(
            r.client.try_claim(&r.id, &pid, &r.a),
            Err(Ok(Error::NothingToClaim))
        );
    }

    // 15. The real authorizations each entry point requires.
    #[test]
    fn required_authorizations() {
        let r = setup();
        let e = &r.env;
        let end = T0 + HOUR;
        let members = vec![e, r.a.clone(), r.b.clone(), r.c.clone()];
        let shares = vec![e, 5_000u32, 3_000, 2_000];

        // open_period: exactly the operator.
        let pid = r.client.open_period(&r.id, &members, &shares, &end);
        assert_eq!(
            e.auths(),
            std::vec![(
                r.operator.clone(),
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        r.contract.clone(),
                        Symbol::new(e, "open_period"),
                        (r.id, members.clone(), shares.clone(), end).into_val(e),
                    )),
                    sub_invocations: std::vec![],
                }
            )]
        );

        // purchase: exactly the buyer (covering the token sub-transfers).
        r.client.purchase(&r.id, &r.buyer, &r.vendor, &1_000_000_000);
        let auths = e.auths();
        assert_eq!(auths.len(), 1);
        assert_eq!(auths[0].0, r.buyer);

        // close_period: permissionless — no authorization required.
        advance(&r, HOUR);
        r.client.close_period(&r.id, &pid);
        assert_eq!(e.auths(), std::vec![]);

        // claim: exactly the member.
        r.client.claim(&r.id, &pid, &r.a);
        assert_eq!(
            e.auths(),
            std::vec![(
                r.a.clone(),
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        r.contract.clone(),
                        Symbol::new(e, "claim"),
                        (r.id, pid, r.a.clone()).into_val(e),
                    )),
                    sub_invocations: std::vec![],
                }
            )]
        );

        // ── Strict mode: no signatures at all ──
        e.set_auths(&[]);
        assert!(r.client.try_claim(&r.id, &pid, &r.b).is_err());
        assert!(r
            .client
            .try_open_period(&r.id, &members, &shares, &(e.ledger().timestamp() + HOUR))
            .is_err());
        assert!(r
            .client
            .try_purchase(&r.id, &r.buyer, &r.vendor, &1_000)
            .is_err());
        assert!(r
            .client
            .try_create_rewards_marketplace(&r.operator, &9_000, &500, &500)
            .is_err());
        assert!(r.client.try_register_vendor(&r.id, &r.buyer).is_err());

        // A stranger (not the operator) cannot open a period.
        let stranger = Address::generate(e);
        e.mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &r.contract,
                fn_name: "open_period",
                args: (r.id, members.clone(), shares.clone(), e.ledger().timestamp() + HOUR)
                    .into_val(e),
                sub_invokes: &[],
            },
        }]);
        assert!(r
            .client
            .try_open_period(&r.id, &members, &shares, &(e.ledger().timestamp() + HOUR))
            .is_err());

        // Member b claiming with its own signature works in strict mode too.
        e.mock_auths(&[MockAuth {
            address: &r.b,
            invoke: &MockAuthInvoke {
                contract: &r.contract,
                fn_name: "claim",
                args: (r.id, pid, &r.b).into_val(e),
                sub_invokes: &[],
            },
        }]);
        assert_eq!(r.client.claim(&r.id, &pid, &r.b), 15_000_000);
        // Member b's signature can't be reused to pay member c.
        e.mock_auths(&[MockAuth {
            address: &r.b,
            invoke: &MockAuthInvoke {
                contract: &r.contract,
                fn_name: "claim",
                args: (r.id, pid, &r.c).into_val(e),
                sub_invokes: &[],
            },
        }]);
        assert!(r.client.try_claim(&r.id, &pid, &r.c).is_err());
        assert!(!r.client.get_entitlement(&r.id, &pid, &r.c).claimed);
    }

    // Classic (non-rewards) marketplaces behave exactly as before.
    #[test]
    fn classic_marketplace_unchanged() {
        let r = setup();
        let fund = Address::generate(&r.env);
        let id = r
            .client
            .create_marketplace(&r.operator, &fund, &9_000, &800, &200);
        r.client.register_vendor(&id, &r.vendor);
        assert_eq!(r.client.purchase(&id, &r.buyer, &r.vendor, &420_000_000), None);
        assert_eq!(r.token.balance(&fund), 8_400_000);
        assert_eq!(r.token.balance(&r.contract), 0);
    }
}
