<p align="center">
  <img src="./logo.png" alt="Compaki logo" width="180" />
</p>

# Compaki

Compaki is a multi-vendor marketplace platform for communities, local producers
and purpose-driven commerce, built on Stellar and Soroban. An operator launches
a marketplace, onboards vendors and sells products. Each payment is split
automatically between the **vendor**, the **marketplace operator** and a
**community fund**.

The community share can work in three ways, chosen at launch:

- **Classic:** it goes straight to a community fund account with every sale.
- **Community Rewards:** the Soroban contract holds it and, every period
  (monthly, quarterly, every 6 months or yearly), shares it between that
  period's **sellers and buyers**, in proportion to what each one sold and
  bought. Each period ends with a distribution that the API triggers the
  moment it is due; at that point the operator can change the next period's
  sellers/buyers split and frequency.
- **Fundraising:** the contract holds it until a target is reached, then pays
  it to public recipient wallets at fixed shares. Then a new round starts
  (same target, or a new one the operator picks; 0 stops fundraising).

Nobody, including the operator or Compaki, can withdraw the saved funds or
change a running period's or round's rules.

> **Testnet only.** All money is a self-issued demo asset on Stellar testnet
> (`CPKUSD` on fresh deployments; older deployments used the code `USDC` with
> a Compaki-issued issuer). It is **not** Circle's USDC and has no value.
> People who sign in with email get their **own Cavos wallet** and sign their
> purchases and claims themselves; older/demo accounts are still **custodial**.
> See [Wallets and sign-in](#wallets-and-sign-in-cavos) and
> [Guarantees and limitations](#guarantees-and-limitations).

- [How Community Rewards works](#how-community-rewards-works)
- [Contract architecture](#contract-architecture)
- [From purchase to claim](#from-purchase-to-claim)
- [Wallets and sign-in (Cavos)](#wallets-and-sign-in-cavos)
- [Guarantees and limitations](#guarantees-and-limitations)
- [Run locally](#run-locally) · [Testnet](#stellar-testnet) · [Tests](#tests)
- [Example transactions](#example-transactions)
- [What existed before vs. what the ideathon added](#before-and-during-the-ideathon)
- [Judges' demo guide](docs/judges-demo.md)

## How Community Rewards works

1. **Choose at launch.** In the wizard the operator picks where the community
   share goes. A rewards marketplace is registered with
   `create_rewards_marketplace(operator, v, o, c, period_seconds,
   vendor_pool_bps)`: the first period starts right away and lasts at least
   `period_seconds`; `vendor_pool_bps` of each period's pool goes to sellers
   and the rest to buyers. The mode itself can't be switched later.
2. **Sales fund the current period.** Each purchase transfers the vendor and
   operator shares and Compaki's 2% directly, and the community share to the
   **contract itself**, all in one atomic invocation. The contract books it
   to the current period and adds the sale amount to the vendor's volume and
   to the buyer's volume for that period.
3. **Distribution.** Once the period's length has passed, `distribute` ends
   it: its pools are frozen and claimable, and the next period starts at that
   moment. The API's scheduler (`src/lib/distribution.ts`, every 30 s)
   submits it as soon as it is due, so it happens on time without anyone
   pressing a button. **Anyone** may distribute without changes, so the
   operator can't hold rewards back; passing new rules
   (`RewardsRules { vendor_pool_bps, buyer_pool_bps, period_seconds }`)
   requires the **operator's** signature. In the dashboard the operator
   schedules those rules ahead of time with `set_next_rules` (signed while
   they are there, in their own wallet); the next `distribute` applies them,
   still without any signature. The running period never changes.
4. **Claim.** Every seller and buyer of a distributed period claims
   `vendor_pool × their sales / all sales + buyer_pool × their purchases /
   all purchases`, once, with their own signature, paid only to their own
   address.

**Rounding.** Each part rounds down, so a period never pays out more than its
pools; the dust (under one stroop per participant) stays in the contract.
Property tests check this, and that selling to yourself to win a bigger share
always loses money (at least the operator and platform shares of the fake
sales).

**Fundraising.** `create_fundraise_marketplace(…, target, recipients,
shares_bps, policy)` keeps the community share until a round raises
`target`. `release_fundraise(id, next_target)` then pays everything raised to
the recipients at their fixed shares. With `next_target = None` (anyone may
call; the API does it right after the sale that reaches the target) the
policy decides what follows: `NewRound` (same target again) or `Stop`. With
`Some(t)` (operator only) the next round's target is `t`, and `0` stops
fundraising. In the dashboard the operator schedules it ahead of time with
`set_next_target`, and a release without arguments applies it. Once stopped,
sellers keep the community share of later sales.

## Contract architecture

One deployment (`contracts/marketplace`) serves every marketplace, keyed by
`marketplace_id`. Funds of all rewards and fundraising marketplaces sit in the
contract's single token balance; accounting is kept per marketplace, period
and participant.

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

**Compaki platform fee.** Every sale pays a fixed 2% (`PLATFORM_FEE_BPS = 200`,
a constant) straight from the buyer to the platform account set at
`initialize`; a marketplace's vendor / operator / community shares cover the
other 98% (e.g. 93 / 5 / 0 by default in the launch wizard). Like every other
leg it is a direct transfer inside `purchase`.

There is **no** withdraw or sweep function. The only paths out of the
treasury are `claim` (to a participant) and `release_fundraise` (to the fixed
recipients). The code is **upgradeable** by the admin (see
[Guarantees](#guarantees-and-limitations)).

Storage (`DataKey`): `Config(id)`, `Vendor(id, addr)`, `Rewards(id)`
(current period, its start, length, pool split, lifetime totals),
`Period(id, p)` (start, end, split, pools, volumes, claimed, distributed),
`Participation(id, p, addr)` (sold, bought, claimed), `Fundraise(id)`,
`NextRules(id)` and `NextTarget(id)` (scheduled by the operator). Every
entry a call touches has its TTL extended to about 30 days; archived entries
are restored automatically when used. Arithmetic is checked, and
`overflow-checks` stays on in release. Events: `market`, `rewards`,
`fundrais`, `vendor`, `purchase`, `nxtrules`, `distrib`, `claim`, `nxttarg`,
`release`, `upgrade`.

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

On the app side:

- **Checkout** (`POST /api/orders/:id/pay`) settles **one `purchase`
  transaction per cart item**, recorded from the contract's receipt. Each
  item's split is atomic, but the cart as a whole is not; a retry resumes from
  the first unsettled item.
- **Operator:** Dashboard → *Community rewards* / *Fundraising* shows the fund,
  the running period (rules, countdown, pools), each period's sellers and
  buyers with their estimated or final rewards, the next period's rules form
  (or the next round's target), a *Distribute now* fallback, and a *How is the
  fund protected?* panel.
- **Sellers and buyers:** `/rewards` lists the periods they took part in, with
  on-chain amounts and a *Collect reward* button.
- **Public:** `/m/:slug/community` shows the same, plus the recipients and
  payouts of a fundraiser.

**On-chain vs. Postgres.** Rules, pools, totals, recipients and each person's
reward are read from the contract (`src/lib/rewards.ts`,
`src/lib/fundraise.ts`). Postgres stores auxiliary data: who sold and bought
in each period (`Sale.splitSnapshot`), names, transaction hashes
(`RewardClaim`, `RewardsDistribution`, `FundraiseRelease`) and the operator's
**pending** next-period rules / next target until they are passed on-chain.

API (`apps/api/src/routes/rewards.ts`):

| Endpoint | Who |
| --- | --- |
| `GET /api/rewards/marketplace/:slug` | public (on-chain view + tx links) |
| `PUT /api/rewards/marketplace/:slug/next-rules` | operator: `{ vendorPoolBps, periodSeconds }` or `{ clear: true }`; own wallets get 202 + a transaction to sign |
| `POST /api/rewards/marketplace/:slug/distribute` | any signed-in user (fallback; the scheduler does it on time) |
| `POST /api/rewards/marketplace/:slug/periods/:id/claim` | the signed-in seller or buyer (for themself only) |
| `PUT /api/rewards/marketplace/:slug/fundraise/next-target` | operator: `{ targetUsd }` (0 = stop, `null` = default); own wallets get 202 + a transaction to sign |
| `POST /api/rewards/marketplace/:slug/fundraise/release` | any signed-in user (fallback) |
| `POST /api/rewards/marketplace/:slug/guarantees` | operator: `{ kind: "claim-for-someone" \| "withdraw" }` |
| `GET /api/rewards/me` | signed-in user's periods |

The guarantee checks simulate the forbidden action against the live contracts
with the operator's real authorization attached, in enforced-auth mode, which
is exactly what the network would execute. Nothing is submitted. Each check
also runs a **positive control** through the same harness, so a rejection
can't be an artefact of the simulation.

## Public community benefits and transparency

Community-enabled marketplaces now publish a dedicated page at
`/m/:slug/community`, linked from their storefront. On creation, organizers must
explain their purpose, intended beneficiaries, and how and when contributions
are used or shared. An optional USD fundraising target shows progress against
recorded completed sales. Existing organizers can add or edit these fields in
**Dashboard → Community story**. The metadata is public and does not change the
contract's split, period rules or beneficiary wallets.

The page shows:

- Revenue percentages, cumulative recorded sales and recipient earnings, full
  public recipient wallets, and explorer links; no emails, buyer information or
  private keys are included.
- Classic community funds: cumulative recorded community contributions and the
  live fund-account balance, explicitly separated. Further use or redistribution
  is organizer-managed and is not verified by Compaki.
- Community Rewards: current-contract contribution, held and collected totals;
  the most recent period and recent history; end dates, member names, full
  recipient addresses, fixed shares, projected/final rewards and payment links.
  A period must end and be closed before members can collect individually;
  its end time is not an automatic payout date.
- Clear missing-information and verification-error states. A failed balance
  lookup is never substituted with zero. Fund totals cover the current contract;
  historical recorded sales can include earlier deployments, and are labeled
  separately. Fundraising targets do not trigger payouts.

New API routes: `GET /api/marketplaces/:slug/community` (public), and
`PATCH /api/marketplaces/:slug/community` (organizer only). The public view refreshes
every 30 seconds and indicates when it was last read. Rewards history currently
includes up to 12 periods; current-contract totals include every period.

Apply the additive database migration before deploying the updated API:

```bash
cd apps/api
npm run prisma:migrate:deploy
npm run prisma:generate
npm run test:community
```

## Wallets and sign-in (Cavos)

New users sign in with their **email** through [Cavos](https://docs.cavos.xyz)
(`@cavos/kit`): Cavos emails a code, verifies it, and opens the user's own
Stellar wallet — a classic `G…` account whose key Cavos derives from the login
and keeps in its vault. **Compaki never holds that key.**

| Step | Who does what |
| --- | --- |
| Sign in | Browser: `sendOtp` / `verifyOtp`. The wallet signs a one-time challenge (`signMessage`); the API verifies the ed25519 signature (`POST /api/auth/cavos`). |
| Email | Trusted only if Cavos' signed email token verifies against `enclave.cavos.xyz`'s published keys; only then can an existing account be linked by email. A reported email is ignored. |
| Activate | API funds the address with testnet XLM (Friendbot) and prepares the trustline + starting demo balance; the wallet signs it (`signXdr`). |
| Purchase / claim | API prepares each transaction with the user's wallet as source; the wallet signs it in the browser; `POST /api/tx/:id` submits it only if it hashes to the prepared transaction and carries the wallet's signature. One signature per cart item. |

**Already have a Stellar wallet?** Users can also sign in with Freighter, xBull,
Albedo, Lobstr and others through [Stellar Wallets Kit](https://stellarwalletskit.dev).
The API issues a standard **SEP-10** challenge (see below); the wallet signs it
and the API verifies it (`POST /api/auth/wallet`) and sets the session cookie.
Each challenge is accepted once. Activation, purchases and claims then work
exactly as for Cavos — the wallet signs each prepared transaction. The wallet
must be switched to **Testnet**.

### SEP-1 and SEP-10

- **SEP-1 (`stellar.toml`).** The web app serves
  `/.well-known/stellar.toml` (generated by the API from its config): Compaki's
  organization info, the SEP-10 `SIGNING_KEY` and `WEB_AUTH_ENDPOINT`, the
  accounts Compaki operates, and the demo asset — `status = "test"`, not
  anchored, its token contract, and a description saying it is **not
  Circle's USDC** and has no value. `npm run stellar:home-domain -- <domain>`
  sets the asset issuer's `home_domain` to the web app's domain, so wallets
  and stellar.expert show that information next to the asset.
- **SEP-10 (web authentication).** `GET /api/auth/sep10?account=G…` returns a
  challenge (sequence 0, 15-minute bounds, `<home_domain> auth` and
  `web_auth_domain` entries, signed by the server key); `POST
  /api/auth/sep10` with the signed `transaction` (JSON or form) returns a JWT.
  Any SEP-10 client can authenticate against Compaki this way, and the app's
  own wallet sign-in uses the same challenge. Accounts that exist must be
  signed by signers meeting their medium threshold (multisig works); new
  accounts by their master key. Built on the SDK's `WebAuth` helpers.
- **Configuration.** `HOME_DOMAIN` (API) is the web app's host, e.g.
  `compaki.example` (default `localhost:3000`). The signing key comes from
  `SEP10_SIGNING_SECRET`, or is derived from `SESSION_SECRET` /
  `WALLET_ENCRYPTION_KEY` so it stays stable without another variable; it
  never holds funds.

Personal money (purchases, vendor revenue, member rewards) uses the user's own
wallet (Cavos or existing) as soon as it is active. **The same goes for
marketplace owners**: a marketplace launched by someone with their own wallet
is registered with that wallet as its operator — they sign the creation in
the browser and the operator share of every sale lands in it. The operator
only signs while present (launching, scheduling the next rules or target):
vendors register themselves with `join` (their own wallet signs, or the
backend for custodial vendors), and distributions and releases need no
signature. `Marketplace.operatorAddress` records the address. Accounts
created before Cavos (and the seeded demo accounts) keep their custodial
account, which the backend signs for, and can still sign in with a password.

Setup: create an app in the Cavos console, add your web origin under allowed
origins, and set `NEXT_PUBLIC_CAVOS_APP_ID` (see `apps/web/env.example`).
Optionally set `CAVOS_APP_ID` on the API so email tokens are also checked
against your app id.

## Guarantees and limitations

**Enforced on-chain by the contract:**

- The community share of a rewards or fundraising marketplace leaves the
  buyer and enters the contract in the same atomic invocation as the vendor,
  operator and platform legs.
- Each contribution is booked to exactly one `(marketplace, period)` or
  fundraising round. Other marketplaces' and other periods' funds can't be
  claimed.
- A running period's split and length can't change. New rules apply only to
  the next period, only via `distribute` and only with the operator's
  signature; without changes, anyone can distribute once the period's length
  has passed, so rewards can't be held back.
- Claims require a distributed period, a sale or purchase by that address in
  it, the **participant's** own authorization, and no previous claim. Payouts
  go only to the participant's address and can never exceed the period's
  pools (rounding down, plus an explicit check).
- Fundraising recipients and shares are fixed at creation. A round is paid
  out only once it reaches its target, only to those recipients; only the
  operator can choose a different next target.
- No admin, operator or Compaki function can move treasury funds. The token
  contract also refuses transfers out of the contract that the contract
  itself didn't authorize (tested in Rust and on testnet).

**Not enforced by the contract (be precise about these):**

- **Custody.** Two models coexist:
  - **Cavos wallets** (email sign-in): the user's key stays with Cavos/the user;
    purchases and claims carry the user's own signature, and payouts land in a
    wallet Compaki cannot move. Trust shifts to Cavos' key management (vault,
    enclave recovery) instead of Compaki.
  - **Custodial accounts** (pre-Cavos and demo accounts, including
    operators without their own wallet): the key is held by the Compaki
    backend (AES-256-GCM, `WALLET_ENCRYPTION_KEY`), so `require_auth()` proves
    "the backend signed for this user". For those operators the backend can do
    anything an operator can (register vendors, schedule the next period's
    rules) — but it still **cannot** withdraw the treasury or change a running
    period: the contract forbids that for everyone. Operators with their own
    wallet keep their key.
  Compaki is therefore **not** fully non-custodial.
- **Signing requests are kept in memory** (single API instance): an API restart
  drops pending signatures and the user retries the action.
- **Who takes part** comes from real sales: any address that sells or buys
  in a period shares its pool. Self-dealing never pays (the operator and
  platform shares are lost), but the contract can't tell people apart.
- **Liveness:** distribution needs a transaction; the API's scheduler sends it
  on time, and anyone else can too. Unclaimed rewards stay claimable
  indefinitely (there is deliberately no sweep).
- **Token issuer powers** are outside the contract. The demo issuer is created
  with no clawback or revocation flags, but with real USDC the issuer (Circle)
  could freeze or claw back balances.
- **Upgrades.** The contract is upgradeable: `upgrade(new_wasm_hash)`
  replaces its code while keeping its address and all stored data
  (`npm run deploy:testnet -- --upgrade`). Only the admin set at `initialize`
  (the deploy's issuer account) can do it, and every upgrade is a public
  `upgrade` event on Stellar. This is a trust trade-off: new code could change
  the rules above, so the guarantees hold for the code version that is
  deployed (`version()`), and whoever holds the admin key must be trusted not
  to replace it with a malicious version. On testnet the API also holds that
  key (it is the demo-asset issuer). New code must read the stored data as
  the old code wrote it.
- Checkout is per item (see above). The API's timeout retry can resubmit a
  transaction whose confirmation timed out; that was pre-existing behaviour and
  is safe for `claim` (`AlreadyClaimed`), but it is not idempotent for
  `purchase`.
- `/api/rewards/me` finds the user's periods from their recorded sales and
  reads each reward from the contract (12 periods per marketplace). That's
  fine for a demo; production would index the contract's events.

**Security fixes made in this release:**

- `/api/demo/impersonate` is **off by default**. It only works with
  `ENABLE_DEMO_IMPERSONATION=true`, **never** when `NODE_ENV=production`, and
  only for an operator switching into one of their own vendors.
- Registering with the email of an existing passwordless (legacy) account
  **no longer claims it**. Admins set a password with
  `npm run users:set-password -- <email>`.
- Vendor registration (`POST /api/marketplaces/:slug/vendors`) used to upsert
  a user **by the email in the request body and return that user's session
  cookie**, which let anyone take over any account. It now always registers
  the signed-in user.
- The operator dashboard API (vendor emails, accounts) now requires the
  operator's session.

## Run locally

Prerequisites: Node.js 18+, Rust with `rustup target add wasm32v1-none`, the
Stellar CLI and [Scaffold Stellar](https://github.com/theahaco/scaffold-stellar)
(`cargo install --locked stellar-scaffold-cli`), PostgreSQL (e.g. Supabase),
Stellar testnet access.

```bash
cd apps/api
npm install
# create apps/api/.env with DATABASE_URL and DIRECT_URL (Postgres)
npm run deploy:testnet # issuer + CPKUSD token + contract → .env.local
npm run prisma:migrate:deploy
DEMO_SEED_PASSWORD='choose-a-demo-password' npm run demo:seed
npm run dev            # http://localhost:4000
```

```bash
cd apps/web
npm install
npm run dev            # http://localhost:3000 (proxies /api → API_URL, default :4000)
```

The seed creates **Café de Altura** as a Community Rewards marketplace with
operator `maria@cafedealtura.example`, two vendors, three buyers
(`lucia@`, `marco@`, `emma@example.com`), 10-minute periods whose pool goes
60% to sellers and 40% to buyers (`SEED_PERIOD_SECONDS`), and 5 real
purchases. All seeded users get `DEMO_SEED_PASSWORD`.

Environment variables used by this release:

| Variable | Where | Meaning |
| --- | --- | --- |
| `MARKETPLACE_CONTRACT_ID` | API | Contract the API talks to (written by deploy). |
| `DEMO_USDC_CODE` / `_ISSUER_*` / `_SAC_ADDRESS` | API | Demo asset (historical names; the asset is not USDC). |
| `WALLET_ENCRYPTION_KEY`, `SESSION_SECRET` | API | Custodial key encryption; session HMAC (falls back to the wallet key). |
| `ENABLE_DEMO_IMPERSONATION` | API | `true` to allow the local demo switcher (ignored in production). |
| `DEMO_SEED_PASSWORD`, `SEED_PERIOD_SECONDS` | seed | Demo logins; seeded period length (default 600). |
| `COMMUNITY_SCHEDULER`, `COMMUNITY_TICK_SECONDS` | API | `off` disables automatic distributions and payouts (run it on one API instance); how often it checks (default 30). |
| `DEMO_ASSET_CODE`, `DEPLOY_ENV_FILE` | deploy | Asset code for fresh deploys (default `CPKUSD`); alternative env file. |
| `NEXT_PUBLIC_CAVOS_APP_ID`, `NEXT_PUBLIC_CAVOS_ENV` | web | Cavos app id (public) and environment (`development` default). |
| `CAVOS_APP_ID` | API | Optional: also require Cavos email tokens to be issued for this app. |
| `HOME_DOMAIN` | API | The web app's host, for stellar.toml and SEP-10 (default `localhost:3000`). |
| `SEP10_SIGNING_SECRET` | API | Optional SEP-10 signing key (otherwise derived from the session secret). |

## Stellar testnet

```bash
cd apps/api
npm run deploy:testnet                     # full: new issuer, CPKUSD token, contract
npm run deploy:testnet -- --upgrade        # new code for the deployed contract (same address)
npm run deploy:testnet -- --contract-only  # new contract, keep issuer/token/accounts
npm run demo:rewards                       # on-chain proof of the whole flow (no DB)
npm run demo:purchase                      # classic marketplace proof (unchanged)
```

Testnet storage fees have risen sharply. In late October 2026 uploading the
contract code cost ~10,900 XLM (the ~37 KB wasm Scaffold Stellar optimizes;
~17,000 XLM unoptimized), keeping it alive for 30 days ~35,800 XLM, and
creating a marketplace ~55 XLM. Both are above a
transaction's own fee field (a uint32, ~429 XLM), so the deploy script pays
through a fee-bump transaction, whose fee field is 64-bit. They are also above
what one Friendbot account holds (10,000 XLM), so the deploy script and the
API's keep-alive fund the payer by merging fresh Friendbot accounts into it
(free test XLM). Uploading and extending need no particular signer; only
`upgrade` is signed by the admin.

### Shipping a contract change

Contracts deployed from this version on are upgraded in place:

```bash
cd apps/api
npm run contract:client                    # regenerates the API's typed contract client
npm run deploy:testnet -- --upgrade        # builds, uploads, upgrade(hash) with the admin key
```

The address, marketplaces, periods and funds stay; nothing needs rebinding.
Bump `CONTRACT_VERSION` with each change so `version()` shows which code is
live.

### Scaffold Stellar

The repository root is a [Scaffold Stellar](https://github.com/theahaco/scaffold-stellar)
project (`scaffold.yml`, Cargo workspace with `contracts/<name>`).
`stellar scaffold build` compiles and optimizes the contract and generates its
typed TypeScript client from the contract's spec. The API encodes every
contract call and decodes every result through that client
(`apps/api/src/lib/stellar/generated/marketplace.ts`, refreshed by
`npm run contract:client`), so a contract change the API doesn't follow fails
the typecheck instead of failing on-chain. The deploy script uploads the wasm
Scaffold optimized (~37 KB instead of ~42 KB, so cheaper rent). Deploys and
upgrades stay with `npm run deploy:testnet`: `scaffold.yml` points testnet at
the deployed contract and never deploys to a public network.

### Migrating an existing deployment

Contracts deployed before `upgrade` existed need a new contract and a rebind
once. On-chain marketplace ids are only valid inside one deployment.
`Marketplace.contractId` records which deployment a row belongs to, and the
API **refuses** (fails safe) any marketplace whose `contractId` isn't the
configured `MARKETPLACE_CONTRACT_ID`.

```bash
cd apps/api
npm run prisma:migrate:deploy
npm run deploy:testnet -- --contract-only           # rewrites MARKETPLACE_CONTRACT_ID only
npm run marketplaces:rebind -- --dry-run
npm run marketplaces:rebind                          # re-registers marketplaces + vendors
```

Ship the API code, the migration and `MARKETPLACE_CONTRACT_ID` together:
until they match, marketplaces answer "not ready for purchases". Sale
history and receipts are untouched; funds left in an older contract stay
claimable there with `stellar contract invoke`.

## Tests

```bash
cargo build --target wasm32v1-none --release && cargo test   # 44 tests (repo root)
cd apps/api && npm run typecheck && npm run test:community && npm run test:sep10 && npm run build
cd apps/web && npm run typecheck && npm run lint && node --test tests/*.test.mjs && npm run build
```

The contract tests cover the split and platform fee; rewards booked by sales
and purchases; distribution timing; new rules for the next period (validated,
operator-only) while the distributed period keeps its own; claims (before
distribution, twice, by non-participants); periods isolated from each other
and marketplaces from each other; rounding; self-dealing never paying;
fundraising rounds, payouts above target, a new target or a stop chosen by the
operator; vendors joining with their own signature, and next rules and
targets scheduled by the operator then applied without any signature;
withdrawal attempts (including a direct token transfer out of the
contract); only the admin upgrading, and a real upgrade keeping the stored
data; and the exact `require_auth` set of every entry point. Happy paths
assert `env.auths()`; negative auth tests run in strict mode (`set_auths(&[])`
/ targeted `mock_auths`) with positive controls. Mutating each guard of the
contract (auth checks, timing, validation, rounding, policy defaults…) makes
the suite fail; the two survivors are redundant checks with no observable
effect.

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
`npm run deploy:testnet -- --upgrade` to code `0a886a08f2ab2c36…` (`version()` =
4). Its address, both marketplaces, the distributed period, the
new 30/70 split and the fundraiser's round 2 target were all still there.

## Before and during the ideathon

**Already in Compaki before the ideathon:** Next.js frontend and Hono +
Prisma/Postgres API; Soroban contract with marketplace creation, vendor
registration and atomic 3-way split purchases; marketplace launch wizard;
vendor onboarding and products; cart and per-item checkout; verifiable
receipts linking to stellar.expert; operator and vendor dashboards; custodial
testnet accounts; 9 contract tests.

**Added during the ideathon (Community Rewards v1):**

- Contract: rewards marketplaces, protected treasury, per-marketplace and
  per-period accounting, periods with frozen fixed-share members,
  permissionless close with exact rounding, one-time member claims, views,
  events, TTL management, and 17 new tests.
- API: rewards endpoints, on-chain read model, contract error mapping,
  guarantee checks, period booking at checkout, `contractId` binding, and the
  `marketplaces:rebind`, `deploy --contract-only`, `demo:rewards` and
  `users:set-password` scripts.
- Web: the *Community rewards* operator tab, the `/rewards` member page, and a
  Community Rewards option in the launch wizard.
- Security: the impersonation, legacy-claim and vendor-join takeover fixes
  above, plus operator-only dashboard data.
- Fixes found along the way: the API retried every failed Stellar call (the
  timeout check matched its own stack frame), and `deploy:testnet` crashed
  under ESM (`__dirname`)

## Project layout

```text
apps/web/      Next.js app (App Router)      apps/api/      Hono API + Prisma
  src/app/dashboard/[slug]/rewards-panel.tsx   src/lib/stellar/   only module talking to the chain
  src/app/rewards/                             src/lib/rewards.ts on-chain read model
contracts/marketplace/  Soroban contract + tests (Cargo workspace and scaffold.yml at the root)
apps/api/src/lib/stellar/generated/  typed contract client generated by Scaffold Stellar
docs/judges-demo.md     5-minute demo script
```
