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

### Schema notes (v1)

- `User.role` is a string (`OPERATOR | VENDOR | BUYER`) because SQLite has no
  enums; the `Role` union type in `src/lib/db/types.ts` enforces it in code.
- Splits are stored in **basis points** (`splitVendorBps` etc., summing to
  10 000) to avoid float drift in money math.
- `Sale.splitSnapshot` is a JSON string capturing the split *at purchase
  time*, so later config changes never rewrite history.
- `Marketplace.contractMarketplaceId` stays `null` until the marketplace is
  registered in the on-chain contract (later phase).
