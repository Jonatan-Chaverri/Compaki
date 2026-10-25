# Community Rewards — judges' demo (about 5 minutes)

Everything runs on **Stellar testnet** with a self-issued demo asset (`CPKUSD`,
not Circle USDC). Every on-chain step has a "verify ↗" link to stellar.expert.

**Prep** (see the README for full setup):

```bash
cd apps/api
DEMO_SEED_PASSWORD='choose-a-demo-password' SEED_PERIOD_SECONDS=600 npm run demo:seed
npm run dev    # and in apps/web: npm run dev
```

`SEED_PERIOD_SECONDS=600` gives the marketplace 10-minute periods so a whole
period fits in the demo (the wizard offers monthly to yearly, plus this
testnet-only option).

Keep two browser windows open: **operator** (`maria@cafedealtura.example`) and
**buyer** (`marco@example.com`). Both use `DEMO_SEED_PASSWORD`.

## 1. Show the rules

Open `http://localhost:3000/m/cafe-de-altura/community`, or, signed in as
María, the dashboard → **Community rewards** tab. Point at:

- **In the rewards fund / Total contributed / Claimed**, read live from the
  contract (link at the top).
- The rules: shared every 10 minutes, **60% to sellers by sales, 40% to
  buyers by purchases**, and the current period's countdown.
- The current period's sellers and buyers with their estimated rewards (from
  the five seeded sales).

## 2. Make a purchase

In the buyer window, add a product to the cart and pay. Each cart item
settles as its own atomic `purchase` transaction (vendor 83% / marketplace
10% / community 5% / Compaki 2%).

- The receipt shows *"Community Rewards fund · period 1"* with a link to the
  transaction; on stellar.expert it shows four transfers, one of them **to
  the contract address**.
- The dashboard refreshes every 10 s: the period's pools grow, and Marco
  appears as a buyer.

## 3. Change the next period's rules

Still on the rewards tab, in **Next period's rules**, choose for example
*every 6 months* and 30% sellers / 70% buyers → **Schedule these rules**. The
running period keeps 60/40; the change is stored in the contract right away
(`set_next_rules`, signed by the operator — in their own wallet if they have
one) and the next distribution applies it without any signature.

## 4. Distribution

When the countdown reaches zero, the API distributes the period within about
30 seconds by itself (or click **Distribute now**). The period becomes
*Distributed · rewards can be claimed* with a *Verify distribution ↗* link,
the next period starts with the new rules, and its card shows the new split.

## 5. Claim a reward

In the buyer window, open the account menu → **My rewards** (`/rewards`) →
**Collect reward**. The banner moves from pending to "$X received" with a tx
link, and the operator's tab shows Marco as *claimed ↗*. Claiming again is
refused (`AlreadyClaimed`).

## 6. Show that withdrawals and claims for others fail

Open **How is the community fund protected?** on the rewards tab:

- **Withdraw the fund to your account** is rejected with `Unauthorized`.
  Even with the operator's signature, the token contract refuses to move
  funds out of the Compaki contract. The control (the operator moving its
  *own* tokens through the same harness) is accepted.
- **Claim a buyer's reward for them** is rejected with `Unauthorized`: only
  the participant's own signature can claim.

These checks are evaluated against the live testnet contracts with enforced
authorization and are never submitted.

**CLI alternative.** `npm run demo:rewards` runs the whole story on-chain —
rewards (with new rules at the distribution) and a fundraiser (with a new
target chosen at the payout), including every rejection — in about 2 minutes
and prints a table of transactions.

**Be upfront with judges:**

- The seeded demo accounts (María included) are custodial, so the backend
  signs for them. People who sign in with email or their own Stellar wallet
  sign their purchases and claims themselves, and a marketplace they launch is
  owned by that wallet: they sign its creation and receive the operator share
  in it.
- The contract is **upgradeable** by Compaki's admin key (same address, data
  kept). The guarantees hold for the deployed code version; trusting the
  admin key is part of the model. See *Guarantees and limitations* in the
  README.
