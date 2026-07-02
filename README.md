# Compaki

Multi-vendor marketplace platform where payments settle instantly and split
automatically between vendors, the marketplace operator, and an optional
community fund. Built on Stellar/Soroban (testnet) under the hood — end users
only ever see payments, balances, payouts, and `$`.

**Status:** demo for the Stellar Community Fund. Testnet only, custodial
accounts, corners cut everywhere except the on-chain money movement, which is
real and verifiable on [stellar.expert](https://stellar.expert/explorer/testnet).

## Stack

- **Frontend + API:** Next.js (App Router, TypeScript strict), Tailwind CSS
- **Database:** SQLite via Prisma for the demo (schema designed to swap to
  Postgres/Supabase — see notes in [prisma/schema.prisma](prisma/schema.prisma))
- **Blockchain:** Soroban smart contract in Rust (workspace in `contracts/`),
  deployed to Stellar **testnet**; backend talks to it via
  `@stellar/stellar-sdk` through `src/lib/stellar/` only
- **Payment asset:** self-issued demo "USDC" on testnet, shown as `$` in the UI

## Project layout

```
src/app/           Next.js routes (App Router)
src/lib/db/        Prisma client singleton + TS types (Role, SplitSnapshot)
src/lib/stellar/   Stellar/Soroban service layer — sole chain touchpoint
contracts/         Rust workspace for the Soroban marketplace contract
prisma/            Schema + migrations (SQLite dev.db)
```

On-chain: money movement and split config only. Off-chain (DB): users,
marketplaces, product catalog, sales history. Every sale stores its Stellar
transaction hash so receipts link to stellar.expert.

## Phase 1 — scaffolding + landing page

### Run it

```bash
npm install
npx prisma migrate dev   # creates prisma/dev.db and generates the client
npm run dev              # → http://localhost:3000
```

### What to check

- `http://localhost:3000` — marketing landing page (hero, three feature
  cards, regenerative-mode callout, CTA). The CTA links to `/onboarding`,
  which intentionally 404s until the onboarding phase.
- `npx prisma studio` — inspect the empty `User`, `Marketplace`, `Product`,
  and `Sale` tables.

## Phase 2 — Soroban contract + testnet deployment

### The contract (`contracts/marketplace`)

One deployment, many marketplaces: each `create_marketplace` call registers an
instance (keyed by `marketplace_id`) with its own operator, community fund and
bps split (must sum to 10 000). `purchase` moves demo USDC from the buyer to
vendor / operator / community fund **atomically in one invocation** — both
percentage shares round down and the remainder always goes to the community
fund, so no dust is ever lost. Every purchase emits an event with all split
amounts.

```bash
cd contracts && cargo test        # 9 unit tests: split math, rounding, auth, validation
```

### Deploy to testnet

```bash
rustup target add wasm32v1-none   # once; emits MVP wasm Soroban accepts
npm run deploy:testnet
```

This creates + funds a demo-USDC issuer via Friendbot, deploys the USDC
Stellar Asset Contract, builds/uploads/deploys the marketplace contract,
initializes it, and writes everything to `.env.local` (RPC URLs, issuer keys,
SAC + contract IDs, and a `WALLET_ENCRYPTION_KEY` for custodial secrets —
preserved across re-deploys). Pure `@stellar/stellar-sdk`; no stellar-cli
version dependency.

### Prove it works

```bash
npm run demo:purchase
```

Provisions four custodial accounts (operator, community fund, vendor, buyer
with $100), creates a 90/8/2 marketplace on-chain, registers the vendor,
executes a $42 purchase and prints resulting balances
($37.80 / $3.36 / $0.84 / $58.00) plus the stellar.expert receipt link.

### Backend service layer (`src/lib/stellar/`)

- `contract.ts` — typed wrappers (`createMarketplace`, `registerVendor`,
  `purchase`, `getMarketplace`): build → simulate → sign with server-held
  keys → submit → poll. The signer is the tx source, so its signature also
  covers the token sub-transfers' `require_auth`.
- `accounts.ts` — `createCustodialAccount()`: keypair → Friendbot →
  trustline + optional starting balance (single transaction) → AES-encrypted
  secret for DB storage. Plus `mintDemoUsd` and `getUsdBalance` helpers.
- `crypto.ts` — AES-256-GCM for custodial secrets (key from env; demo-grade).
- `retry.ts` — every outbound call retries once on timeout-ish errors
  (testnet is flaky); deploy adds retries for RPC load-balancer lag.

## Phase 3 — operator onboarding wizard

### Try it

With the dev server running (and `.env.local` from `npm run deploy:testnet`):

1. `http://localhost:3000/onboarding` — 4-step wizard:
   **About** (name, live-checked URL slug auto-suggested from the name,
   description, category) → **Revenue split** (three sliders that always sum
   to 100%; "Enable regenerative mode" sets the community fund to 5% and
   unlocks its slider) → **Your account** (name + email, no password — a
   session cookie signs you in) → **Launch**.
2. The launch screen's progress rows reflect real server-side steps streamed
   over SSE: custodial payment accounts (operator + community fund, funded +
   trustlines) → `create_marketplace` on-chain → DB records.
3. Success screen shows `compaki.app/m/{slug}`, a dashboard button, and a
   small "verified on-chain" link to the create_marketplace transaction on
   stellar.expert.

### API

- `GET /api/marketplaces/check-slug?slug=x` — live slug availability.
- `POST /api/marketplaces` — launch orchestrator; responds with an SSE stream
  (`step` events for accounts/deploy/store, then `complete` or `error`).
  Idempotent on retry: the operator is reused by email, the marketplace + fund
  account by slug, and the on-chain step is skipped if `contractMarketplaceId`
  is already set — so a retry never creates duplicates. Sets the demo session
  cookie (`compaki_uid`).

Schema additions (migration `onboarding_fields`): `Marketplace.category`,
`Marketplace.createTxHash`, `Marketplace.communityFundId → User` (each
marketplace gets its own custodial community-fund account, role `COMMUNITY`).

### Schema notes (v1)

- `User.role` is a string (`OPERATOR | VENDOR | BUYER`) because SQLite has no
  enums; the `Role` union type in `src/lib/db/types.ts` enforces it in code.
- Splits are stored in **basis points** (`splitVendorBps` etc., summing to
  10 000) to avoid float drift in money math.
- `Sale.splitSnapshot` is a JSON string capturing the split *at purchase
  time*, so later config changes never rewrite history.
- `Marketplace.contractMarketplaceId` stays `null` until the marketplace is
  registered in the on-chain contract (later phase).
