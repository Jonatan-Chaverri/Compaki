# Compaki — SCF demo runbook (5 minutes)

The exact click-path and script for the pitch. Everything runs against
**real Stellar testnet** — money actually moves and every claim is
verifiable on stellar.expert.

## Before the demo (once, ~10 minutes)

```bash
cd apps/api
npm install
npm run prisma:migrate                    # Supabase/Postgres
npm run deploy:testnet                    # issuer + contract → apps/api/.env.local
npm run demo:seed                         # builds "Café de Altura" with real txs
npm run dev                               # api :4000

cd ../web
npm install
npm run dev                               # web :3000
```

`demo:seed` prints a block of links at the end — **paste them into a note
you keep next to the demo**. That list (storefront, dashboard, receipts,
stellar.expert txs) is also your fallback plan (see below).

Sanity check 5 minutes before presenting: open `localhost:3000/m/cafe-de-altura`
and confirm the live balance cards show numbers (proves testnet + Horizon are up).

---

## The 5 minutes

### 1. Landing → the promise (30s)

Open `localhost:3000`.

> "Compaki lets anyone deploy a multi-vendor marketplace with payment
> infrastructure included — instant payouts, automatic revenue splits, and
> a public receipt for every sale. This is what we'll prove in the next
> five minutes, with real money movement on Stellar testnet."

Point at the hero receipt card: "every purchase splits itself — you'll see
a real one shortly."

### 2. Create a NEW marketplace live (90s)

Click **Create your marketplace** → fill the wizard while talking:

- Name: anything ("Feria del Mar"), the slug autochecks live.
- Splits: drag the sliders; toggle **regenerative mode** — "the operator
  chooses a cause; a percentage of every sale flows there automatically."
- Your account: your name + any email. No passwords — demo-grade auth.
- **Launch** → the three progress rows are real server-side steps streamed
  live: custodial payment accounts, on-chain registration, store setup.

> "What just happened: Compaki provisioned real payment accounts and
> registered the split rules on-chain. That's the whole 'payments team'
> a marketplace normally needs — done in about thirty seconds."

Click the small **verified on-chain ↗** link on the success screen if the
audience is technical.

### 3. A purchase on the seeded marketplace (90s)

Open `localhost:3000/m/cafe-de-altura` (from your saved links).

> "This is a marketplace that's been operating for a few days — Café de
> Altura, two coffee growers, regenerative mode on: 5% of every sale funds
> the Escuela Verde school."

**Before buying**, open the operator dashboard in a second tab
(`/dashboard/cafe-de-altura`) and point at the **live balance cards** —
these poll the real on-chain balances every 5 seconds.

Back on the storefront: **Buy now** on any product → your name + email →
**Pay**. While the spinner runs (~5-10s):

> "Right now a custodial buyer account is paying, and the contract is
> splitting the money three ways atomically — vendor, operator, community
> fund. No invoices, no reconciliation, no 30-day payout."

### 4. Vendor balance updates (30s)

Switch to the dashboard tab: the sale is in the feed and the live balances
have already ticked up.

> "The grower just got paid. Not 'pending' — settled. Anywhere in the
> world, in seconds."

(If you want the vendor's own view: Vendors tab → "View their dashboard".)

### 5. The transparent receipt (60s)

On the success screen click **See where your money went →**.

> "This is the buyer's receipt — public and shareable. Every recipient,
> every percentage, every cent. And this line at the bottom is the only
> place we ever mention blockchain: the payment settled on Stellar in a
> few seconds and cannot be altered. Trust is the feature; the chain is
> the implementation detail."

Click **Verified ✓** → stellar.expert opens with the actual transaction.

> "You don't have to take our word for any of this — neither does a
> buyer, a vendor, or a community. That's the point."

---

## Fallback plan (testnet slow or down)

Testnet closes ledgers ~every 5s but has bad days. Degrade gracefully,
in this order:

1. **Purchase hangs >30s** (step 3): keep talking over the spinner — the
   UI stays honest ("Settling on-chain…"). If it errors, the message is
   human and retryable; retry once.
2. **Still failing**: skip the live purchase and open a **seeded receipt**
   from your saved `demo:seed` links — the breakdown and the
   stellar.expert transaction are real, pre-recorded on-chain. Say:
   "Here's one from this morning — same flow, settled in N seconds."
3. **Wizard on-chain step fails** (step 2): the launch screen lets you
   retry idempotently. If testnet is truly down, show the seeded
   marketplace's **verified on-chain** links instead and narrate the
   wizard over the filled-in form.
4. **Horizon down (balances show —)**: the dashboards degrade to "—"
   without breaking; lean on the receipt + stellar.expert history links.

Golden rule: every seeded artifact (marketplace creation, vendor
registrations, 5 sales) already exists on-chain — you can prove every
claim in the pitch with links alone, without executing anything live.
