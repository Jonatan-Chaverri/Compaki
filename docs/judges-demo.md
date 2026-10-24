# Community Rewards — judges' demo (about 5 minutes)

Everything runs on **Stellar testnet** with a self-issued demo asset (`CPKUSD`,
not Circle USDC). Every on-chain step has a "view transaction ↗" link to
stellar.expert.

**Prep** (see the README for full setup):

```bash
cd apps/api
DEMO_SEED_PASSWORD='choose-a-demo-password' SEED_PERIOD_MINUTES=4 npm run demo:seed
npm run dev    # and in apps/web: npm run dev
```

Keep two browser windows open: **operator** (`maria@cafedealtura.example`) and
**member** (`escuela@cafedealtura.example`). Both use `DEMO_SEED_PASSWORD`.

## 1. Select the marketplace

Open `http://localhost:3000/m/cafe-de-altura`. The banner reads *"5% of every
sale funds Community Rewards treasury (on-chain)"*. Signed in as María, open
the account menu → dashboard → **Community rewards** tab.

## 2. Show the rewards configuration

On the Community rewards tab, point at:

- **Held in treasury / Contributed / Claimed**, read live from the contract
  (link at the top).
- **Period #0**: status *Active* with a ledger-time countdown, and members
  50% / 30% / 20% with their projected rewards. The *opened ↗* link is the
  `open_period` transaction that froze these shares.

## 3. Make a purchase

In another window (any signed-in buyer, e.g. `marco@example.com`), add a
product to the cart and pay. Checkout settles each cart item as its own
atomic `purchase` transaction (vendor 85% / operator 10% / community 5%).

## 4. Verify the community contribution

- The receipt shows *"Community Rewards treasury · period #0"* with a link to
  the purchase transaction.
- Back on the dashboard (it auto-refreshes every 10 s), **Collected** for the
  period and **Held in treasury** have both increased. Expand *contributing
  sales* to see each purchase tx.
- On stellar.expert the purchase transaction shows three transfers, one of
  them **to the contract address**, plus a `contrib` event.

## 5. Close the period

When the countdown hits zero the status becomes *Ended — ready to close*.

- Optional: buy again now and checkout is refused with *"Community Rewards
  period isn't open…"*. No money moves; the contract rejected it with
  `NoActivePeriod`.
- Click **Close period & fix rewards**. After about 5–10 s you get "confirmed
  on-chain" with a tx link, and each member row shows its final **Reward**
  (they sum exactly to the period total).

## 6. Claim a reward

In the member window, open account menu → **My rewards** (`/rewards`) →
**Claim**. The banner moves from pending to "$X received: confirmed on-chain"
with a tx link. The operator's tab now shows that member as *claimed ↗*.
Clicking Claim again (or calling the API) returns *already claimed*
(`AlreadyClaimed`).

## 7. Show that unauthorized withdrawals and rule changes fail

Re-open a period first (form on the rewards tab → *Reuse members of period #0*
→ 2 minutes → **Commit rules & open period**), then use **Try to break the
rules**:

- **Redirect the running period to another address** is rejected with
  `PeriodActive`. The control shows the operator's signature *was* accepted;
  the contract's own rule said no.
- **Withdraw the treasury to your account** is rejected with `Unauthorized`.
  Even with the operator's signature, the token contract refuses to move
  funds out of the Compaki contract. The control (the operator moving its
  *own* tokens through the same harness) is accepted.

These checks are evaluated against the live testnet contracts with enforced
authorization and are never submitted.

**CLI alternative.** `npm run demo:rewards` runs the whole story on-chain
(including every rejection) in about 2 minutes and prints a table of
transactions.

**Be upfront with judges:** accounts are custodial, so the backend signs for
users. The contract guarantees the distribution rules and that nobody can drain
the treasury, but payouts land in custodial accounts. See *Guarantees and
limitations* in the README.
