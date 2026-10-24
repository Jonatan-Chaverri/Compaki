<p align="center">
  <img src="./logo.png" alt="Compaki logo" width="180" />
</p>

# Compaki

Compaki is a multi-vendor marketplace platform for communities, local producers
and purpose-driven commerce, built on Stellar and Soroban. An operator launches
a marketplace, onboards vendors and sells products. Each payment is split
automatically between the **vendor**, the **marketplace operator** and a
**community fund**.

**Community Rewards** (added for the Stellar ideathon, Scale track) turns that
community fund into a protected on-chain treasury. A fixed share of every sale
is held by the Soroban contract, booked to a time-boxed **period**, and paid out
to registered members according to percentages that are fixed before the period
starts. Neither the operator nor Compaki can withdraw that money or change a
running period's rules.

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

1. **Opt-in at launch.** When an operator launches a marketplace with Community
   Rewards on, it is registered with `create_rewards_marketplace`. The mode is
   fixed on-chain and can't be switched later. Classic marketplaces keep
   working exactly as before: their community share goes straight to a fund
   account.
2. **Open a period.** The operator commits the rules: up to **20 members**,
   each with a share in basis points (`10_000 = 100%`, must sum to exactly
   10 000, no duplicates, no zero shares, the operator can't list itself), plus
   an end time in **ledger time**. A new period can only be opened once the
   previous one has ended.
3. **Sales fund it.** Each purchase transfers the vendor share to the vendor
   and the operator share to the operator. The community share goes to the
   **contract itself**, booked to `(marketplace, period)`. All of this happens
   in one atomic invocation.
4. **Close.** Once the ledger passes the end time, **anyone** can close the
   period. Closing computes every member's final entitlement once, so the
   operator can't hold rewards hostage by never closing.
5. **Claim.** Each member claims their own entitlement once, with their own
   authorization, and it is paid only to their address.

**No active period?** A purchase on a rewards marketplace is **rejected
atomically** (`NoActivePeriod`): no money moves, and the API answers 409 with a
clear message. There is no fallback that silently sends the community share to
an operator-controlled account. The trade-off is that sales pause between
periods, and operators should open the next period as soon as one ends.

**Rounding.** Each member gets `floor(total × share / 10_000)`. The few
leftover stroops (always fewer than the number of members) go one each to the
first members in list order. Entitlements always sum to exactly the period
total, so nothing is over-paid and no dust is stranded. A property test checks
this over many totals and uneven splits.

## Contract architecture

One deployment (`contracts/marketplace`) serves every marketplace, keyed by
`marketplace_id`. Funds of all rewards marketplaces sit in the contract's
single token balance. Accounting is kept per marketplace and per period, and
claims can only debit the entitlement of the `(marketplace, period, member)`
they name.

| Function | Auth | Purpose |
| --- | --- | --- |
| `initialize(admin, token)` | admin | One-time: payment token. The admin has **no** privileged functions. |
| `create_marketplace(operator, fund, v, o, c)` | operator | Classic marketplace (unchanged behaviour). |
| `create_rewards_marketplace(operator, v, o, c)` | operator | Rewards marketplace; `community_fund` = the contract. |
| `register_vendor(id, vendor)` | operator | Unchanged. |
| `purchase(id, buyer, vendor, amount) -> Option<u32>` | buyer | Atomic split; returns the period the community share was booked to. |
| `open_period(id, members, shares_bps, end_ts) -> u32` | operator | Commits rules; only after the previous period ended. |
| `close_period(id, period) -> i128` | none | After `end_ts`; fixes entitlements. |
| `claim(id, period, member) -> i128` | member | Pays the member's entitlement once. |
| `rewards_status`, `get_period`, `get_entitlement(s)`, `get_marketplace` | none | Views (`rewards_status` also returns ledger time). |

There is **no** withdraw, sweep, admin-transfer or upgrade function. The only
path out of the treasury is `claim`.

Storage (`DataKey`): `Config(id)`, `Vendor(id, addr)`, `Rewards(id)`
(period count + lifetime contributed/claimed), `Period(id, p)` (members,
shares, start/end, totals, closed), `Entitlement(id, p, member)` (written at
close). Every entry a call touches has its TTL extended to about 30 days.
Archived persistent entries can be restored on Soroban, never deleted.
Arithmetic uses checked operations, and `overflow-checks` stays on in release.
Events: `market`, `vendor`, `purchase`, `contrib`, `p_open`, `p_close`, `claim`.

Errors are explicit (`NoActivePeriod`, `PeriodActive`, `PeriodNotEnded`,
`PeriodNotClosed`, `NotBeneficiary`, `AlreadyClaimed`, `InvalidBeneficiaries`,
…); the full list is `Error` in `contracts/marketplace/src/lib.rs`.

## From purchase to claim

```text
buyer ──purchase──▶ contract ──┬─▶ vendor      (vendor_bps)
                               ├─▶ operator    (operator_bps)
                               └─▶ contract treasury (community_bps + rounding dust)
                                     booked to Period(marketplace, current)
ledger time ≥ end_ts ──close_period (anyone)──▶ Entitlement(member) = fixed amounts
member ──claim (member auth)──▶ contract ──▶ member address   (once)
```

On the app side:

- **Checkout** (`POST /api/orders/:id/pay`) still settles **one `purchase`
  transaction per cart item**. Each item's split is atomic, but the cart as a
  whole is not. A failure midway leaves earlier items settled, and retrying
  resumes from the first unsettled item.
- **Operator:** Dashboard → *Community rewards* shows the treasury, the current
  period with a countdown, members, shares, projected and final rewards, claim
  status, the open-period form, the close button, period history with explorer
  links, and a *Try to break the rules* panel.
- **Members:** `/rewards` (*My rewards* in the account menu) lists their
  periods across marketplaces, with on-chain amounts and a *Claim* button that
  shows pending, confirmed (with explorer link) and error states.

**On-chain vs. Postgres.** Treasury totals, periods, members, shares,
entitlements and claim status are **always read from the contract**
(`src/lib/rewards.ts`). Postgres stores only auxiliary data: transaction
hashes for explorer links (`RewardsPeriod`, `RewardClaim`), member names, and
which sale fed which period (`Sale.splitSnapshot.rewardsPeriodId`). No balance
or claim right is derived from the database.

API (`apps/api/src/routes/rewards.ts`):

| Endpoint | Who |
| --- | --- |
| `GET /api/rewards/marketplace/:slug` | public (on-chain view + tx links) |
| `POST /api/rewards/marketplace/:slug/periods` | operator: `{ durationMinutes, beneficiaries: [{ email \| address, shareBps }] }` |
| `POST /api/rewards/marketplace/:slug/periods/:id/close` | operator or a member of that period |
| `POST /api/rewards/marketplace/:slug/periods/:id/claim` | the signed-in member (claims for themself only) |
| `POST /api/rewards/marketplace/:slug/guarantees` | operator: `{ kind: "change-rules" \| "withdraw" }` |
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

Personal money (purchases, vendor revenue, member rewards) uses the Cavos
wallet as soon as it is active. **The marketplace operator stays a server-held
service account**: creating marketplaces, registering vendors, opening and
paying for closing periods are signed by the API — otherwise every vendor
sign-up would wait for the operator's manual approval. Accounts created before
Cavos (and the seeded demo accounts) keep their custodial account and can
still sign in with a password.

Setup: create an app in the Cavos console, add your web origin under allowed
origins, and set `NEXT_PUBLIC_CAVOS_APP_ID` (see `apps/web/env.example`).
Optionally set `CAVOS_APP_ID` on the API so email tokens are also checked
against your app id.

## Guarantees and limitations

**Enforced on-chain by the contract:**

- The community share of a rewards marketplace leaves the buyer and enters the
  contract in the same atomic invocation as the vendor and operator legs.
- Each contribution is booked to exactly one `(marketplace, period)`. Other
  marketplaces' and other periods' funds can't be claimed.
- A period's members and shares can't change once it is opened. A new period
  can't be opened while one is running, and closed periods can't be re-closed
  or re-allocated.
- Periods close only after their ledger end time. Claims require a closed
  period, a registered member, the **member's** authorization, and no previous
  claim. Payouts go only to the member's own address.
- Total claims can never exceed what was contributed (by construction, plus an
  explicit check).
- No admin, operator or Compaki function can move treasury funds. The token
  contract also refuses transfers out of the contract that the contract
  itself didn't authorize (tested in Rust and on testnet).

**Not enforced by the contract (be precise about these):**

- **Custody.** Two models coexist:
  - **Cavos wallets** (email sign-in): the user's key stays with Cavos/the user;
    purchases and claims carry the user's own signature, and payouts land in a
    wallet Compaki cannot move. Trust shifts to Cavos' key management (vault,
    enclave recovery) instead of Compaki.
  - **Custodial accounts** (operators, pre-Cavos and demo accounts): the key is
    held by the Compaki backend (AES-256-GCM, `WALLET_ENCRYPTION_KEY`), so
    `require_auth()` proves "the backend signed for this user". The backend
    holds every operator key and can do anything an operator can (open periods,
    register vendors) — but it still **cannot** withdraw the treasury or change
    running periods: the contract forbids that for everyone.
  Compaki is therefore **not** fully non-custodial.
- **Signing requests are kept in memory** (single API instance): an API restart
  drops pending signatures and the user retries the action.
- **Who the members are** is the operator's choice. The contract stops the
  operator from listing its own address but can't detect other addresses the
  operator controls. The guarantee is that the rules are public and frozen
  before the money arrives, not identity verification.
- **Liveness:** sales pause when no period is open, and unclaimed rewards stay
  claimable indefinitely (there is deliberately no sweep).
- **Token issuer powers** are outside the contract. The demo issuer is created
  with no clawback or revocation flags, but with real USDC the issuer (Circle)
  could freeze or claw back balances.
- **No upgrades.** The contract is immutable by design: an upgrade function
  would let its admin replace the rules. Shipping a contract change means a
  new deployment plus `marketplaces:rebind`. Funds left in an old deployment
  stay claimable there via `stellar contract invoke`, but the API only talks
  to the configured contract.
- Checkout is per item (see above). The API's timeout retry can resubmit a
  transaction whose confirmation timed out; that was pre-existing behaviour and
  is safe for `claim` (`AlreadyClaimed`), but it is not idempotent for
  `purchase`.
- `/api/rewards/me` scans rewards marketplaces' recent periods
  (12 per marketplace, 25 marketplaces). That's fine for a demo; production
  would index the contract's `p_open` events.

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

Prerequisites: Node.js 18+, Rust with `rustup target add wasm32v1-none`,
PostgreSQL (e.g. Supabase), Stellar testnet access.

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
operator `maria@cafedealtura.example`, two vendors, members
`escuela@cafedealtura.example` (50%), `brigada@cafedealtura.example` (30%) and
`lucia@example.com` (20%), a 10-minute period (`SEED_PERIOD_MINUTES`), and 5
real purchases. All seeded users get `DEMO_SEED_PASSWORD`.

Environment variables used by this release:

| Variable | Where | Meaning |
| --- | --- | --- |
| `MARKETPLACE_CONTRACT_ID` | API | Contract the API talks to (written by deploy). |
| `DEMO_USDC_CODE` / `_ISSUER_*` / `_SAC_ADDRESS` | API | Demo asset (historical names; the asset is not USDC). |
| `WALLET_ENCRYPTION_KEY`, `SESSION_SECRET` | API | Custodial key encryption; session HMAC (falls back to the wallet key). |
| `ENABLE_DEMO_IMPERSONATION` | API | `true` to allow the local demo switcher (ignored in production). |
| `DEMO_SEED_PASSWORD`, `SEED_PERIOD_MINUTES` | seed | Demo logins; seeded period length. |
| `DEMO_ASSET_CODE`, `DEPLOY_ENV_FILE` | deploy | Asset code for fresh deploys (default `CPKUSD`); alternative env file. |
| `DEMO_PERIOD_SECONDS` | `demo:rewards` | Period length for the CLI proof (default 45). |
| `NEXT_PUBLIC_CAVOS_APP_ID`, `NEXT_PUBLIC_CAVOS_ENV` | web | Cavos app id (public) and environment (`development` default). |
| `CAVOS_APP_ID` | API | Optional: also require Cavos email tokens to be issued for this app. |

## Stellar testnet

```bash
cd apps/api
npm run deploy:testnet                     # full: new issuer, CPKUSD token, contract
npm run deploy:testnet -- --contract-only  # new contract, keep issuer/token/accounts
npm run demo:rewards                       # on-chain proof of the whole flow (no DB)
npm run demo:purchase                      # classic marketplace proof (unchanged)
```

### Migrating an existing deployment

Contract WASM changes never reach a deployed contract, and the pre-ideathon
contract has no rewards functions, so existing installs need a new contract
and a rebind. On-chain marketplace ids are only valid inside one deployment.
`Marketplace.contractId` records which deployment a row belongs to, and the
API **refuses** (fails safe) any marketplace whose `contractId` isn't the
configured `MARKETPLACE_CONTRACT_ID`.

```bash
cd apps/api
npm run prisma:migrate:deploy                       # additive; existing rows get contractId = NULL
npm run deploy:testnet -- --contract-only           # rewrites MARKETPLACE_CONTRACT_ID only
npm run marketplaces:rebind -- --dry-run
npm run marketplaces:rebind -- --rewards cafe-de-altura   # re-registers marketplaces + vendors
# No redeploy? Bind existing rows to the current contract instead:
npm run marketplaces:rebind -- --adopt
```

Until `rebind`/`--adopt` runs, every marketplace answers "not ready for
purchases", so run the migration, deploy and rebind together. Sale history,
receipts and balances already paid out are untouched. Old community-fund
accounts keep their funds.

## Tests

```bash
cd contracts && cargo test                         # 26 tests (9 pre-existing + 17 rewards)
cd apps/api && npm run typecheck && npm run build
cd apps/web && npm run typecheck && npm run lint && npm run build
```

The rewards tests cover: the 3-way split into the treasury; accumulation;
close; fixed-share allocation; claims; double claim; claim before close;
premature close; changing committed shares; admin and operator withdrawal
attempts (including a direct token transfer out of the contract); isolation
between marketplaces and between periods; rounding (exact cases plus a sweep);
invalid configurations; and the exact `require_auth` set of every entry point.
Happy paths assert `env.auths()`. Negative auth tests run in strict mode
(`set_auths(&[])` / targeted `mock_auths`) rather than `mock_all_auths`, with
positive controls. Nine mutations of the contract's guards (removing auth,
time, double-claim, duplicate, rounding checks…) were each caught by the
suite.

## Example transactions

From `npm run demo:rewards` on testnet, contract
[`CC46HNM74RDUX3ZEPA5VISKDJK5H5EIDETDXZDBE24FQ6S2BPIHUB3RI`](https://stellar.expert/explorer/testnet/contract/CC46HNM74RDUX3ZEPA5VISKDJK5H5EIDETDXZDBE24FQ6S2BPIHUB3RI)
(90/5/5 split; members 50/30/20; purchases of $42.00 and $18.50):

| Step | Transaction |
| --- | --- |
| create_rewards_marketplace | [bdef43b0e9…](https://stellar.expert/explorer/testnet/tx/bdef43b0e952ed635c4a363ca5b3c869570f7c8ba20c780c448e59fa0e13ed5c) |
| register_vendor | [58de406537…](https://stellar.expert/explorer/testnet/tx/58de4065374f96ee32a40f69cc4ce72b90afdb9864003d67c254530ef5480f53) |
| open_period (period 0) | [fef4ab5696…](https://stellar.expert/explorer/testnet/tx/fef4ab569625644be9220dd58ef7f560841a13a906d230803abc9b0a989d6af0) |
| purchase $42.00 → period 0 | [fd284a2437…](https://stellar.expert/explorer/testnet/tx/fd284a2437718a30cef5fc45a0f574b86a78ac37ae1723052813686ac2edeec7) |
| purchase $18.50 → period 0 | [1fbd374f76…](https://stellar.expert/explorer/testnet/tx/1fbd374f76534a5e4d78afd6b9ad5d720250e77e0fbacbc9848be9aa5a027991) |
| close_period (total $3.025) | [c7df8ef711…](https://stellar.expert/explorer/testnet/tx/c7df8ef711a9d9cc22b2e2c81b3326067d3e7994c4ad053714b6261d9c33ef20) |
| claim member A (50% → $1.5125) | [ac91d054db…](https://stellar.expert/explorer/testnet/tx/ac91d054db15f2689168e2111b81432fb8e25b06842f28623d0797a6c511e021) |
| claim member B (30% → $0.9075) | [b596d13f6e…](https://stellar.expert/explorer/testnet/tx/b596d13f6e81c84f97709388f81595de620894bf2896dc04af07061dee9adcca) |
| claim member C (20% → $0.605) | [142fe40acc…](https://stellar.expert/explorer/testnet/tx/142fe40acccbab40b029d877c0d3f6159030144e26c2b162f0bf7985b73a66aa) |

| Rejected action | Contract answer |
| --- | --- |
| purchase before any period | `NoActivePeriod` |
| close before end | `PeriodNotEnded` |
| claim before close | `PeriodNotClosed` |
| operator redirects the running period (operator auth accepted) | `PeriodActive` |
| operator withdraws the treasury via the token (own-funds control accepted) | `Unauthorized` |
| second claim by member A | `AlreadyClaimed` |

That contract is a reference deployment made with a fresh `CPKUSD` asset. The
pre-ideathon contract
[`CCCXYF55…QH2U`](https://stellar.expert/explorer/testnet/contract/CCCXYF55U6M44A6RK2WFUXEZDNPMCUI7YDR3YPBBEGWGEO4OSIGZQH2U)
has no Community Rewards; see [Migrating](#migrating-an-existing-deployment).

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
  under ESM (`__dirname`).

## Project layout

```text
apps/web/      Next.js app (App Router)      apps/api/      Hono API + Prisma
  src/app/dashboard/[slug]/rewards-panel.tsx   src/lib/stellar/   only module talking to the chain
  src/app/rewards/                             src/lib/rewards.ts on-chain read model
contracts/marketplace/  Soroban contract + tests
docs/judges-demo.md     5-minute demo script
```
