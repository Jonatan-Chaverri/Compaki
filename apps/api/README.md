# Compaki API

Hono + Prisma (Postgres) API. It is the only part of Compaki that talks to
Stellar: it prepares contract calls for users' wallets to sign and submits
them, reads rewards and fundraising state from the contract, runs the
distribution scheduler and handles sign-in (Cavos, SEP-10). It never holds a
user's key or password.

[Back to the project overview](../../README.md)

- [Run locally](#run-locally)
- [Environment variables](#environment-variables)
- [How the API talks to Stellar](#how-the-api-talks-to-stellar)
- [Sign-in and wallets](#sign-in-and-wallets)
- [Rewards and fundraising](#rewards-and-fundraising)
- [Community page](#community-page)
- [Limitations](#limitations)
- [Stellar testnet](#stellar-testnet)
- [Tests](#tests)

## Run locally

Prerequisites: Node.js 18+, PostgreSQL (e.g. Supabase), and for deploys the
Rust toolchain, the Stellar CLI and Scaffold Stellar (see the
[contract README](../../contracts/marketplace/README.md#build-test-and-ship)).

```bash
cd apps/api
npm install
# create apps/api/.env with DATABASE_URL and DIRECT_URL (Postgres)
npm run deploy:testnet # issuer + CPKUSD token + contract → .env.local
npm run prisma:migrate:deploy
npm run dev            # http://localhost:4000
```

Then sign in through the [web app](../web/README.md) with Cavos or an existing
testnet wallet; every account, marketplace and purchase is created by people
signing with their own wallets.

| Script | What it does |
| --- | --- |
| `deploy:testnet` | Full deploy: issuer, `CPKUSD` token, contract. `--upgrade` ships new code to the same address; `--contract-only` deploys a new contract and keeps issuer, token and accounts. |
| `contract:client` / `contract:client:check` | Regenerate the typed contract client with Scaffold Stellar / check it matches the compiled contract. |
| `demo:rewards` | Proves the rewards and fundraising flows on-chain with throwaway testnet accounts (no database). |
| `data:reset` | Clears old data before a demo. |
| `stellar:home-domain` | Set the asset issuer's `home_domain`, so wallets and explorers show the SEP-1 info. |

## Environment variables

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | Postgres connection (pooled / direct for migrations). |
| `MARKETPLACE_CONTRACT_ID` | Contract the API talks to (written by deploy). |
| `DEMO_USDC_CODE` / `_ISSUER_*` / `_SAC_ADDRESS` | Demo asset (historical names; the asset is not USDC). |
| `SESSION_SECRET` | Signs session cookies (`userId.expiresAt.signature`, 30 days, `Secure` over HTTPS); changing it signs everyone out. Deployments from before it existed fall back to a key derived from `WALLET_ENCRYPTION_KEY`. |
| `HOME_DOMAIN` | The web app's host, without scheme, for `stellar.toml` and SEP-10 (default `localhost:3000`). |
| `SEP10_SIGNING_SECRET` | Optional SEP-10 signing key (otherwise derived from the session secret). |
| `CAVOS_APP_ID` | Optional: also require Cavos email tokens to be issued for this app. |
| `COMMUNITY_SCHEDULER`, `COMMUNITY_TICK_SECONDS` | `off` disables automatic distributions and payouts (run it on one API instance); how often it checks (default 30). |
| `STELLAR_RPC_URL`, `STELLAR_HORIZON_URL` | Default to the public testnet endpoints. |
| `DEMO_ASSET_CODE`, `DEPLOY_ENV_FILE` | Deploy only: asset code for fresh deploys (default `CPKUSD`); alternative env file. |

## How the API talks to Stellar

Everything on-chain goes through [`src/lib/stellar`](src/lib/stellar):

- **Typed contract client.** Every contract call is encoded, and every result
  decoded, through the client Scaffold Stellar generates from the contract
  ([`generated/marketplace.ts`](src/lib/stellar/generated/marketplace.ts)). A
  contract change the API doesn't follow fails the typecheck instead of
  failing on-chain.
- **Stellar RPC** simulates, prepares and submits contract calls. **Horizon**
  handles accounts, trustlines and classic payments.
- **Fee bumps** pay large testnet fees, and **Friendbot** funds new accounts
  and the payers of deploys and the contract keep-alive.
- **Signing.** A user's transaction is returned to the browser: the route
  answers `202` with the transaction, the user's wallet signs it, and
  `POST /api/tx/:id` submits it only if it hashes to the prepared transaction
  and carries that wallet's signature. The backend only signs for Compaki's
  own accounts (the demo-asset issuer, which pays permissionless
  distributions and releases, and the deploy accounts).

**On-chain vs. Postgres.** Rules, pools, totals, recipients and each person's
reward are read from the contract ([`rewards.ts`](src/lib/rewards.ts),
[`fundraise.ts`](src/lib/fundraise.ts)). Postgres stores auxiliary data: who
sold and bought in each period (`Sale.splitSnapshot`), names, transaction
hashes (`RewardClaim`, `RewardsDistribution`, `FundraiseRelease`) and the
operator's **pending** next-period rules or target until they are on-chain.

## Sign-in and wallets

Everyone signs in with their own wallet. New users sign in with **email or
Google** through
[Cavos](https://docs.cavos.xyz), which opens the user's own Stellar wallet: a
classic `G…` account whose key Cavos derives from the login and keeps in its
vault. **Compaki never holds that key.**

| Step | Who does what |
| --- | --- |
| Sign in | The wallet signs a one-time challenge (`signMessage`); the API verifies the ed25519 signature (`POST /api/auth/cavos`). |
| Email | Trusted only if Cavos' signed email token verifies against `enclave.cavos.xyz`'s published keys; only then can an existing account be linked by email. A reported email is ignored. |
| Activate | The API funds the address with testnet XLM (Friendbot) and prepares the trustline and starting demo balance; the wallet signs it. |
| Purchase / claim | The API prepares each transaction with the user's wallet as source; the wallet signs it in the browser. One signature per cart item. |

**Existing wallets** (Freighter, xBull, Albedo, Lobstr…, through Stellar
Wallets Kit in the web app) sign in with a standard **SEP-10** challenge: the
wallet signs it and `POST /api/auth/wallet` verifies it and sets the session
cookie. Each challenge is accepted once. The wallet must be on **Testnet**.

**Marketplace owners** are registered with their wallet as the on-chain
operator: they sign the creation in the browser, and the operator share of
every sale lands in it. A classic marketplace also names the wallet that
receives its community share; it must already accept the demo asset. They only sign while present
(launching, scheduling the next rules or target); vendors register themselves
with `join`, and distributions and releases need no signature.
`Marketplace.operatorAddress` records the address.

### SEP-1 and SEP-10

- **SEP-1.** The API generates `/.well-known/stellar.toml`, which the web app
  serves from its own domain: organization info, the SEP-10 `SIGNING_KEY` and
  `WEB_AUTH_ENDPOINT`, the accounts Compaki operates, and the demo asset with
  `status = "test"`, not anchored, its token contract, and a description
  saying it is **not Circle's USDC** and has no value.
  `npm run stellar:home-domain -- <domain>` points the asset issuer at that
  domain.
- **SEP-10.** `GET /api/auth/sep10?account=G…` returns a challenge (sequence
  0, 15-minute bounds, `<home_domain> auth` and `web_auth_domain` entries,
  signed by the server key); `POST /api/auth/sep10` with the signed
  `transaction` returns a JWT. Any SEP-10 client can authenticate this way,
  and the app's wallet sign-in uses the same challenge. Existing accounts
  must be signed by signers meeting their medium threshold (multisig works);
  new accounts by their master key. Built on the SDK's `WebAuth` helpers.
  The signing key never holds funds.

## Rewards and fundraising

[`src/routes/rewards.ts`](src/routes/rewards.ts):

| Endpoint | Who |
| --- | --- |
| `GET /api/rewards/marketplace/:slug` | Public: on-chain view and transaction links. |
| `PUT /api/rewards/marketplace/:slug/next-rules` | Operator: `{ vendorPoolBps, periodSeconds }` or `{ clear: true }`. Own wallets get `202` and a transaction to sign. |
| `POST /api/rewards/marketplace/:slug/distribute` | Any signed-in user (fallback; the scheduler does it on time). |
| `POST /api/rewards/marketplace/:slug/periods/:id/claim` | The signed-in seller or buyer, for themself only. |
| `PUT /api/rewards/marketplace/:slug/fundraise/next-target` | Operator: `{ targetUsd }` (0 = stop, `null` = default). Own wallets get `202` and a transaction to sign. |
| `POST /api/rewards/marketplace/:slug/fundraise/release` | Any signed-in user (fallback). |
| `POST /api/rewards/marketplace/:slug/guarantees` | Operator: `{ kind: "claim-for-someone" \| "withdraw" }`. |
| `GET /api/rewards/me` | The signed-in user's periods. |

**Scheduler.** [`distribution.ts`](src/lib/distribution.ts) checks every
30 seconds and submits a distribution as soon as a period is due, and a
fundraising release right after the sale that reaches the target.

**Guarantee checks.** The "try to break it" checks simulate a forbidden action
(claiming for someone else, withdrawing) against the live contract with the
operator's real authorization attached, in enforced-auth mode, which is what
the network would execute. Nothing is submitted. Each check also runs a
**positive control** through the same harness, so a rejection can't be an
artefact of the simulation.

**Checkout** (`POST /api/orders/:id/pay`) settles one `purchase` per cart
item, recorded from the contract's receipt. Stock is reserved before
charging, and a payment is never retried after a confirmation timeout, so
there is no overselling and no double charge. A retry resumes from the first
unsettled item.

## Community page

`GET /api/marketplaces/:slug/community` (public) and
`PATCH /api/marketplaces/:slug/community` (organizer only) back the public
`/m/:slug/community` page. Organizers must explain the marketplace's purpose,
beneficiaries and how contributions are used; an optional USD target shows
progress. This metadata never changes the contract's split, period rules or
beneficiary wallets. The page includes no emails, buyer information or keys,
and a failed balance lookup is shown as an error, never as zero. Rewards
history covers up to 12 periods; current-contract totals cover every period.

## Limitations

- **Keys.** Compaki never holds a user's key: purchases, claims, launches and
  vendor registrations carry the user's own signature, and payouts land in
  wallets Compaki can't move. With Cavos, trust shifts to Cavos' key
  management.
- **Signing requests are kept in memory** (single API instance): a restart
  drops pending signatures and the user retries.
- **Checkout is per item:** each item's split is atomic, the cart as a whole
  is not.
- **`/api/rewards/me`** finds a user's periods from recorded sales and reads
  each reward from the contract (12 periods per marketplace). Production
  would index the contract's events.

**Security fixes made during the ideathon:**

- Server-held user accounts, password sign-in and the demo account switcher
  were removed: every account signs with its own wallet.
- Vendor registration used to upsert a user by the email in the request body
  and return that user's session cookie, which let anyone take over any
  account. It now always registers the signed-in user.
- The operator dashboard API (vendor emails, accounts) requires the
  operator's session.
- Session cookies carry a signed expiry, are `Secure` over HTTPS and use their
  own secret.

## Stellar testnet

```bash
npm run deploy:testnet                     # full: new issuer, CPKUSD token, contract
npm run deploy:testnet -- --upgrade        # new code for the deployed contract (same address)
npm run deploy:testnet -- --contract-only  # new contract, keep issuer/token/accounts
npm run demo:rewards                       # on-chain proof of the whole flow (no DB)
```

Testnet storage fees have risen sharply. In late October 2026 uploading the
contract code cost ~10,900 XLM (the ~37 KB optimized wasm), keeping it alive
for 30 days ~35,800 XLM, and creating a marketplace ~55 XLM. Both are above a
transaction's own fee field (a uint32, ~429 XLM), so the deploy script pays
through a fee-bump transaction, whose fee field is 64-bit. They are also above
what one Friendbot account holds (10,000 XLM), so the deploy script and the
keep-alive fund the payer by merging fresh Friendbot accounts into it (free
test XLM). Only `upgrade` needs the admin's signature.

### A new contract

`--contract-only` deploys a new contract for an incompatible storage change.
On-chain marketplace ids are only valid inside one deployment:
`Marketplace.contractId` records which deployment a row belongs to, and the
API **refuses** any marketplace whose `contractId` isn't the configured
`MARKETPLACE_CONTRACT_ID`, so its owner launches it again. Funds left in an
older contract stay claimable there with `stellar contract invoke`.

## Tests

```bash
npm run typecheck && npm test && npm run contract:client:check && npm run build
```

`npm test` runs the community, SEP-10 and session/sign-in-limit unit tests.
`contract:client:check` fails when the contract changed but the generated
client wasn't regenerated. CI also applies every migration to an empty
Postgres and runs the route tests against it (`COMPAKI_DATABASE_TESTS=1`).
