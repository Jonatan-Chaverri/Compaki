# Compaki

Multi-vendor marketplace platform where payments settle instantly and split
automatically between vendors, the marketplace operator, and an optional
community fund. Built on Stellar/Soroban (testnet) under the hood — end users
only ever see payments, balances, payouts, and `$`.

**Status:** demo for the Stellar Community Fund. Testnet only, custodial
accounts, corners cut everywhere except the on-chain money movement, which is
real and verifiable on [stellar.expert](https://stellar.expert/explorer/testnet).

## Stack

- **Frontend:** Next.js (App Router, TypeScript strict) + Tailwind CSS in
  `apps/web` — UI only, no DB or chain access. Proxies `/api/*` to the API
  app (`rewrites` in `next.config.ts`), so cookies and SSE stay same-origin.
- **API:** standalone Hono (Node) app in `apps/api` — owns Prisma, the
  Stellar service layer, and the session cookie
- **Database:** SQLite via Prisma for the demo (schema designed to swap to
  Postgres/Supabase — see notes in [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma))
- **Blockchain:** Soroban smart contract in Rust (workspace in `contracts/`),
  deployed to Stellar **testnet**; the API talks to it via
  `@stellar/stellar-sdk` through `apps/api/src/lib/stellar/` only
- **Payment asset:** self-issued demo "USDC" on testnet, shown as `$` in the UI

## Project layout

```
apps/web/                 Next.js frontend (npm workspace "compaki-web", port 3000)
  src/app/                Pages (App Router) — data comes from the API app
  src/lib/api.ts          Server-component fetch helper (forwards the session cookie)
apps/api/                 Hono API server (npm workspace "compaki-api", port 4000)
  src/routes/             HTTP routes (/api/*)
  src/lib/db/             Prisma client singleton + TS types (Role, SplitSnapshot)
  src/lib/stellar/        Stellar/Soroban service layer — sole chain touchpoint
  prisma/                 Schema + migrations (SQLite dev.db)
  scripts/                Testnet deploy + demo purchase
contracts/                Rust workspace for the Soroban marketplace contract
```

The browser only ever talks to the web app: `apps/web` rewrites `/api/*` to
`http://localhost:4000` (override with `API_URL`), and server components call
the API directly with the session cookie forwarded.

On-chain: money movement and split config only. Off-chain (DB): users,
marketplaces, product catalog, sales history. Every sale stores its Stellar
transaction hash so receipts link to stellar.expert.

## Phase 1 — scaffolding + landing page

### Run it

```bash
npm install                                  # installs both workspaces
(cd apps/api && npx prisma migrate dev)      # creates dev.db and generates the client
npm run dev                                  # api → :4000, web → :3000 (both at once)
```

`npm run dev:api` / `npm run dev:web` start each app on its own.

### What to check

- `http://localhost:3000` — marketing landing page (hero, three feature
  cards, regenerative-mode callout, CTA). The CTA links to `/onboarding`,
  which intentionally 404s until the onboarding phase.
- `npx prisma studio` (in `apps/api`) — inspect the empty `User`, `Marketplace`, `Product`,
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
initializes it, and writes everything to `apps/api/.env.local` (RPC URLs, issuer keys,
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

### API service layer (`apps/api/src/lib/stellar/`)

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

With the dev server running (and `apps/api/.env.local` from `npm run deploy:testnet`):

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

## Phase 4 — vendor flows + operator dashboard

### Vendor journey

1. Operator shares the invite link (`/m/{slug}/join`, shown in the Vendors tab).
2. Vendor registers with name / email / "what do you sell". The server
   provisions their custodial payment account (Friendbot + trustline), calls
   `register_vendor` on-chain (signed by the operator's custodial key — the
   invite implies approval), and records a `VendorMembership` (including the
   registration tx hash). Idempotent on retry.
3. `/vendor/{slug}` — vendor dashboard: **My products** (create/edit with
   price, description, image URL *or* emoji picker), **My sales** (per-sale
   vendor share from the frozen split snapshot), a **live Balance** card
   polling their REAL on-chain token balance every 5 s, and a **Withdraw**
   modal that is honest about the demo ("Off-ramp partners coming soon —
   this demo runs on Stellar testnet").

### Operator dashboard (`/dashboard/{slug}`)

- **Overview** — total sales, gross volume, revenue by recipient
  (vendors/operator/community, summed from split snapshots), live on-chain
  balances of the operator + community fund, recent-sales feed with
  stellar.expert "verify" links.
- **Vendors** — invite link with copy button, vendor list with on-chain
  registration links and a demo-only "view their dashboard" session switcher
  (`/api/demo/impersonate` — the platform is custodial and passwordless, so
  the presenter can hop between roles in one browser).
- **Products** — read-only catalog across all vendors.

`/dashboard` redirects to the session operator's marketplace.

New APIs: `POST /api/marketplaces/[slug]/vendors`, `POST /api/products`,
`PATCH /api/products/[id]`, `GET /api/balance?account=G...` (real SAC balance
lookups feeding every live-balance widget).

## Phase 5 — public storefront + checkout

### Buyer journey

1. `/m/{slug}` — public storefront: marketplace name + description, category,
   product grid (visual, name, vendor, price, "Buy now"). If regenerative
   mode is on, a badge shows "♻ {X}% of every sale funds {fund name}".
2. `/m/{slug}/buy/{productId}` — per-product checkout (no cart for the MVP):
   order summary + buyer name/email + "Pay $X". The card on-ramp is
   simulated and the UI says so ("Demo: payment simulated with test funds").
3. On submit the API (all chain/DB work lives in `apps/api`):
   - gets-or-creates the buyer user + custodial account — new buyers start
     pre-funded with demo USDC; returning buyers are topped up if short,
   - calls the contract's `purchase()` signed by the buyer's custodial key
     (atomic split to vendor / operator / community fund),
   - stores the `Sale` row with `txHash` + frozen `splitSnapshot` (same
     rounding as the contract: shares round down, remainder → community).
4. Success screen (~5-10 s later): "Payment complete" with an animated
   breakdown — "→ $10.80 to {vendor} (Vendor) → $0.60 to {operator}
   (Platform) → $0.60 to {fund} (Community)" — plus "See where your money
   went →" (the Phase 6 receipt page; 404s until then) and a stellar.expert
   verify link.

The full loop closes: after a purchase, the vendor's live balance (polls
every 5 s) ticks up within seconds, and the sale appears in the vendor's
"My sales" and the operator's overview on next load.

New APIs: `GET /api/marketplaces/[slug]/storefront`,
`GET /api/products/[id]` (checkout info),
`POST /api/products/[id]/purchase`.

## Phase 6 — transparent receipt + demo readiness

- `/receipt/{saleId}` — the public, shareable receipt: buyer → split flow
  with names, roles, amounts and percentages, a "Verified ✓" per recipient
  linking to the transaction on stellar.expert, and one trust line at the
  bottom ("settled on the Stellar network in {N} seconds and cannot be
  altered") — the only place the product ever mentions blockchain. OG tags
  make the link preview well. `Sale.settleSeconds` (new migration) stores
  the measured settlement time of each purchase.
- `npm run demo:seed` — builds the full pitch scenario on real testnet:
  "Café de Altura" (regenerative, 85/10/5), operator María, vendors Don
  Carlos + Finca La Esperanza (5 products), and 5 backdated sales with real
  on-chain transactions. Idempotent — safe to re-run; prints every demo
  link (storefront, dashboard, receipts, stellar.expert txs) when done.
- [DEMO.md](DEMO.md) — the 5-minute SCF runbook: exact click-path, what to
  say at each step, and a fallback plan if testnet is slow (every claim in
  the pitch is provable with the seeded links alone).
- New API: `GET /api/sales/[id]/receipt`.

### Schema notes (v1)

- `User.role` is a string (`OPERATOR | VENDOR | BUYER`) because SQLite has no
  enums; the `Role` union type in `apps/api/src/lib/db/types.ts` enforces it in code.
- Splits are stored in **basis points** (`splitVendorBps` etc., summing to
  10 000) to avoid float drift in money math.
- `Sale.splitSnapshot` is a JSON string capturing the split *at purchase
  time*, so later config changes never rewrite history.
- `Marketplace.contractMarketplaceId` stays `null` until the marketplace is
  registered in the on-chain contract (later phase).
