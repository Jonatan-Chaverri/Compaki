# Compaki marketplace contract (Soroban)

One Soroban contract serves every Compaki marketplace, keyed by
`marketplace_id`. It splits each product payment atomically, holds the
community funds of rewards and fundraising marketplaces, and decides who can
claim them. Funds of all marketplaces sit in the contract's single token
balance; accounting is kept per marketplace, period and participant.

[Back to the project overview](../../README.md)

- [Community modes](#community-modes)
- [Functions](#functions)
- [From purchase to claim](#from-purchase-to-claim)
- [Guarantees and limits](#guarantees-and-limits)
- [Build, test and ship](#build-test-and-ship)
- [Example transactions](#example-transactions)

## Community modes

Each marketplace chooses at launch where its community share goes. The mode
can't be switched later.

- **Classic:** the share goes straight to a community fund wallet with every
  sale (the app asks the organizer to name it).
- **Community Rewards:** the contract keeps the share and, each period, shares
  it between that period's sellers and buyers.
- **Fundraising:** the contract keeps the share until a round reaches its
  target, then pays it to fixed public recipients.

### Community Rewards

1. **Launch.** `create_rewards_marketplace(operator, v, o, c, period_seconds,
   vendor_pool_bps)` registers the marketplace. The first period starts right
   away and lasts at least `period_seconds` (the app offers 30, 90, 180 or 365
   days, plus 10 minutes on testnet; the contract's floor is one minute).
   `vendor_pool_bps` of each period's pool goes to sellers and the rest to
   buyers.
2. **Sales fund the current period.** Each purchase transfers the vendor and
   operator shares and Compaki's 2% directly, and the community share to the
   **contract itself**, all in one atomic invocation. The contract books it to
   the current period and adds the sale amount to the vendor's and the buyer's
   volume for that period.
3. **Distribution.** Once the period's length has passed, `distribute` ends
   it: its pools become claimable and the next period starts. **Anyone** may
   distribute without changes, so the operator can't hold rewards back. New
   rules (`RewardsRules { vendor_pool_bps, buyer_pool_bps, period_seconds }`)
   need the **operator's** signature: the operator schedules them ahead of
   time with `set_next_rules`, and the next `distribute` applies them without
   any signature. The running period never changes.
4. **Claim.** Every seller and buyer of a distributed period claims
   `vendor_pool × their sales / all sales + buyer_pool × their purchases / all
   purchases`, once, with their own signature, paid only to their own address.

**Rounding.** Each part rounds down, so a period never pays out more than its
pools; the dust (under one stroop per participant) stays in the contract.
Property tests check this, and that selling to yourself to win a bigger share
always loses money (at least the operator and platform shares of the fake
sales).

### Fundraising

`create_fundraise_marketplace(…, target, recipients, shares_bps, policy)`
keeps the community share until a round raises `target`.
`release_fundraise(id, next_target)` then pays everything raised to the
recipients at their fixed shares.

- With `next_target = None`, anyone may call it, and the policy decides what
  follows: `NewRound` (same target again) or `Stop`.
- With `Some(t)` (operator only), the next round's target is `t`; `0` stops
  fundraising. The operator can schedule it ahead of time with
  `set_next_target`, and a release without arguments applies it.

Once fundraising stops, sellers keep the community share of later sales.

## Functions

| Function | Auth | Purpose |
| --- | --- | --- |
| `initialize(admin, token, platform)` | admin | One-time: payment token, platform-fee recipient and the admin allowed to `upgrade`. |
| `create_marketplace(operator, fund, v, o, c)` | operator | Classic marketplace; `v + o + c` must be 9,800 bps. |
| `create_rewards_marketplace(operator, v, o, c, period_seconds, vendor_pool_bps)` | operator | Rewards marketplace; first period starts now. |
| `create_fundraise_marketplace(operator, v, o, c, target, recipients, shares_bps, policy)` | operator | Fundraising marketplace; up to 20 recipients. |
| `register_vendor(id, vendor)` | operator | Registers a vendor (used when the backend holds the operator's key). |
| `join(id, vendor)` | vendor | A vendor registers itself, so an operator signing in the browser doesn't have to approve each one. |
| `purchase(id, buyer, vendor, amount) -> PurchaseReceipt` | buyer | Atomic split; returns what was paid, and the period or round. |
| `set_next_rules(id, rules: Option<RewardsRules>)` | operator | Schedules (or clears) the next period's rules. |
| `distribute(id, next: Option<RewardsRules>) -> i128` | none, or operator with `next` | Ends a period whose length has passed; the next period uses the scheduled rules, or `next`. |
| `claim(id, period, member) -> i128` | member | Pays a participant's reward for a distributed period, once. |
| `set_next_target(id, target: Option<i128>)` | operator | Schedules (or clears) the next round's target; 0 stops fundraising. |
| `release_fundraise(id, next_target: Option<i128>) -> i128` | none, or operator with a target | Pays out a round that reached its target; the next round uses the scheduled target, `next_target` or the policy. |
| `upgrade(new_wasm_hash)` | admin | Replaces the code, keeping the address and all data. |
| `rewards_status`, `get_period`, `get_reward`, `get_fundraise`, `get_next_rules`, `get_next_target`, `get_marketplace`, `get_platform`, `version`, `get_admin` | none | Views. |

**Compaki platform fee.** Every sale pays a fixed 2% (`PLATFORM_FEE_BPS =
200`, a constant) straight from the buyer to the platform account set at
`initialize`. A marketplace's vendor, operator and community shares cover the
other 98% (93 / 5 / 0 by default in the launch wizard).

There is **no** withdraw or sweep function. The only paths out of the treasury
are `claim` (to a participant) and `release_fundraise` (to the fixed
recipients).

**Storage** (`DataKey`): `Config(id)`, `Vendor(id, addr)`, `Rewards(id)`
(current period, its start, length, pool split, lifetime totals),
`Period(id, p)` (start, end, split, pools, volumes, claimed, distributed),
`Participation(id, p, addr)` (sold, bought, claimed), `Fundraise(id)`,
`NextRules(id)` and `NextTarget(id)`. Every entry a call touches has its TTL
extended to about 30 days; archived entries are restored automatically when
used. Arithmetic is checked, and `overflow-checks` stays on in release.

**Events:** `market`, `rewards`, `fundrais`, `vendor`, `purchase`,
`nxtrules`, `distrib`, `claim`, `nxttarg`, `release`, `upgrade`.

## From purchase to claim

```text
buyer ──purchase──▶ contract ──┬─▶ vendor      (vendor_bps)
                               ├─▶ operator    (operator_bps)
                               ├─▶ Compaki     (fixed 2% platform fee)
                               └─▶ contract treasury (community_bps + rounding dust)
                                     booked to the current period, with the
                                     vendor's sales and the buyer's purchases
period length passed ──distribute (API scheduler; anyone)──▶ period claimable,
                                     next period starts (operator may set its rules)
seller/buyer ──claim (own auth)──▶ contract ──▶ their address   (once)
```

The split is atomic **per product payment**. The app settles a cart as one
`purchase` per item, so a cart as a whole is not atomic.

## Guarantees and limits

**Enforced by the contract:**

- The community share of a rewards or fundraising marketplace leaves the
  buyer and enters the contract in the same atomic invocation as the vendor,
  operator and platform legs.
- Each contribution is booked to exactly one `(marketplace, period)` or
  fundraising round. Other marketplaces' and other periods' funds can't be
  claimed.
- A running period's split and length can't change. New rules apply only to
  the next period, only via `distribute` and only with the operator's
  signature. Without changes, anyone can distribute once the period's length
  has passed, so rewards can't be held back.
- Claims require a distributed period, a sale or purchase by that address in
  it, the **participant's** own authorization, and no previous claim. Payouts
  go only to the participant's address and can never exceed the period's
  pools (rounding down, plus an explicit check).
- Fundraising recipients and shares are fixed at creation. A round is paid out
  only once it reaches its target, only to those recipients; only the operator
  can choose a different next target.
- No admin, operator or Compaki function can move treasury funds. The token
  contract also refuses transfers out of the contract that the contract itself
  didn't authorize (tested in Rust and on testnet).

**Not enforced by the contract:**

- **Upgrades.** `upgrade(new_wasm_hash)` replaces the code while keeping the
  address and all stored data. Only the admin set at `initialize` (the
  deploy's issuer account) can do it, and every upgrade is a public `upgrade`
  event. This is a trust trade-off: new code could change the rules above, so
  the guarantees hold for the deployed code version (`version()`), and
  whoever holds the admin key must be trusted not to replace it with a
  malicious version. On testnet the API also holds that key.
- **Who takes part** comes from real sales: any address that sells or buys in
  a period shares its pool. Self-dealing never pays, but the contract can't
  tell people apart.
- **Liveness.** Distribution needs a transaction. The API's scheduler sends it
  on time, and anyone else can too. Unclaimed rewards stay claimable
  indefinitely; there is deliberately no sweep.
- **Token issuer powers** are outside the contract. The demo issuer is created
  with no clawback or revocation flags, but with real USDC the issuer (Circle)
  could freeze or claw back balances.

Users sign with their own wallets; Compaki never holds their keys (see the
[API README](../../apps/api/README.md#sign-in-and-wallets)).

## Build, test and ship

The repository root is a [Scaffold Stellar](https://github.com/theahaco/scaffold-stellar)
project: a Cargo workspace with `contracts/<name>` and
[`scaffold.yml`](../../scaffold.yml). Prerequisites: Rust with
`rustup target add wasm32v1-none`, the Stellar CLI and Scaffold Stellar
(`cargo install --locked stellar-scaffold-cli`).

```bash
# from the repository root
cargo build --target wasm32v1-none --release && cargo test   # 44 tests
```

The wasm is built first because the upgrade test installs it.

**What the tests cover:**

- the split and the platform fee;
- rewards booked by sales and purchases, distribution timing, and rounding;
- next-period rules (validated, operator-only) while the distributed period
  keeps its own;
- claims before distribution, twice, and by non-participants;
- periods isolated from each other, and marketplaces from each other;
- self-dealing never paying;
- fundraising rounds, payouts above target, and a new target or a stop chosen
  by the operator;
- vendors joining with their own signature, and scheduled rules and targets
  applied without any signature;
- withdrawal attempts, including a direct token transfer out of the contract;
- only the admin upgrading, and a real upgrade keeping the stored data;
- the exact `require_auth` set of every entry point.

Happy paths assert `env.auths()`; negative auth tests run in strict mode
(`set_auths(&[])` or targeted `mock_auths`) with positive controls. Mutating
each guard (auth checks, timing, validation, rounding, policy defaults…)
makes the suite fail; the two survivors are redundant checks with no
observable effect.

### Shipping a change

```bash
cd apps/api
npm run contract:client                    # regenerates the API's typed client
npm run deploy:testnet -- --upgrade        # builds, uploads, upgrade(hash) with the admin key
```

`stellar scaffold build` compiles and optimizes the contract (~37 KB instead
of ~42 KB, so cheaper rent) and generates its typed TypeScript client. The API
calls the contract through that client, so a change the API doesn't follow
fails its typecheck; CI also fails when the client wasn't regenerated. The
address, marketplaces, periods and funds stay. Bump `CONTRACT_VERSION` with
each change so `version()` shows which code is live. Deploys always go
through `npm run deploy:testnet`; `scaffold.yml` never deploys to a public
network. Deploy options and testnet fees are in the
[API README](../../apps/api/README.md#stellar-testnet).

## Example transactions

From `npm run demo:rewards` on testnet, contract
[`CBGWV2H546XCQ22BRFMZNAOUWLZOBPHK4KOCR4OVVBIJC7OJIFEIS3QI`](https://stellar.expert/explorer/testnet/contract/CBGWV2H546XCQ22BRFMZNAOUWLZOBPHK4KOCR4OVVBIJC7OJIFEIS3QI)
(88/5/5 split + 2% Compaki; one-minute periods, pool 60% sellers / 40% buyers;
then a fundraiser with a $5 target paid 70/30):

| Step | Transaction |
| --- | --- |
| create_rewards_marketplace (id 0) | [2b03f5d1f1…](https://stellar.expert/explorer/testnet/tx/2b03f5d1f1a2c27f4817f8790e7342bcf76fdc54c2e611e065363205cff432e4) |
| register_vendor | [91a7dbd889…](https://stellar.expert/explorer/testnet/tx/91a7dbd8894857c104fe735a88645f91565b6e18c438d11196be978c0c8b2f2c) |
| register_vendor | [c1f42834f0…](https://stellar.expert/explorer/testnet/tx/c1f42834f0e74859d78a9ffa641ef9dc037fe1e5fc0672aeb2db197a5cebfb7d) |
| purchase $40.00 → period 1 | [7ceaf16544…](https://stellar.expert/explorer/testnet/tx/7ceaf16544cb2afea0d55ba98074df339619a3ce9da6d8a972974873badce75b) |
| purchase $60.00 → period 1 | [6a6edac53d…](https://stellar.expert/explorer/testnet/tx/6a6edac53d05b307157010ceebde2ef0be8c78df71d7177c7fd0b859edd00703) |
| distribute period 1 ($5.00; next: 30% sellers / 70% buyers) | [24ec179c49…](https://stellar.expert/explorer/testnet/tx/24ec179c491a83e71642309619ab8aadf7d8adb9a45dd801c2cc410b4c8248db) |
| claim vendor 1 → $1.20 | [58426ecc72…](https://stellar.expert/explorer/testnet/tx/58426ecc72d574f176cc3863342feece7e28aefba3bc787d0ced28bc0cc4f31d) |
| claim vendor 2 → $1.80 | [e7a5ad2e42…](https://stellar.expert/explorer/testnet/tx/e7a5ad2e428f6fac24ba57f788f144b02a8b68a0152a234ec744935b7d71c33b) |
| claim buyer A → $0.80 | [cb1394dff4…](https://stellar.expert/explorer/testnet/tx/cb1394dff4d6e00eef5c0c38dc6269fa09618ed8c6e38a6a49b44851ea09fc00) |
| claim buyer B → $1.20 | [13309dc4c5…](https://stellar.expert/explorer/testnet/tx/13309dc4c5ef385235a940cf43d9807046a93408920054bd514693344e664085) |
| purchase $10.00 → period 2: sellers $0.15 / buyers $0.35 | [df1c696898…](https://stellar.expert/explorer/testnet/tx/df1c6968989c47ecd6c3ef7ccc5f25a67dac217409bf99c277c3e73a6d832c4c) |
| create_fundraise_marketplace (id 1) | [cc196b403e…](https://stellar.expert/explorer/testnet/tx/cc196b403e17eac15d29fb05c3f4ef4e0790516739a8dd2d1b3807b85d01546d) |
| register_vendor | [36fab77091…](https://stellar.expert/explorer/testnet/tx/36fab7709153e9e9233ce5875463d02394fd72b610cf61953648a854caf5db60) |
| purchase $60.00 → raised $3.00 | [085942b8c7…](https://stellar.expert/explorer/testnet/tx/085942b8c7488c6b4cd1ec614786c7605423ac6aeff65089a47753e852fc3db1) |
| purchase $40.00 → raised $5.00 | [13ee71c5dc…](https://stellar.expert/explorer/testnet/tx/13ee71c5dcdfd4977b2714ee4267c1120feec613b138584217e0a2d268eeadb0) |
| release_fundraise ($5.00 → 70% / 30%; next target $8) | [fe28ae07f8…](https://stellar.expert/explorer/testnet/tx/fe28ae07f87b4e07e27a82d93bfa1981e9b433dc64e88414d063b5c9c50ae09b) |

| Rejected action | Contract answer |
| --- | --- |
| claim before the distribution | `PeriodNotEnded` |
| operator claim-for-someone (control: operator claiming for its own address: authorization accepted) | `Unauthorized` |
| operator withdraw (control: operator moving its own tokens: accepted) | `Unauthorized` |
| new rules for the next period without the operator | `Unauthorized` |
| second claim by buyer A | `AlreadyClaimed` |
| claim by someone who didn't sell or buy | `NothingToClaim` |
| release below the target | `GoalNotReached` |
| a stranger choosing the next target | `Unauthorized` |

The same contract was then upgraded in place with
`npm run deploy:testnet -- --upgrade` to code `0a886a08f2ab2c36…`
(`version()` = 4). Its address, both marketplaces, the distributed period,
the new 30/70 split and the fundraiser's round 2 target were all still there.
