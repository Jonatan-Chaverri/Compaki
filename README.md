<p align="center">
  <img src="./logo.png" alt="Compaki logo" width="180" />
</p>

# Compaki

**Marketplaces for communities, where every sale also funds a shared
purpose.**

> **Built for the Pura Vida Ideathon**, organized by the **Blockchain
> Acceleration Foundation (BAF)**. Compaki is a working prototype on
> **Stellar testnet** that uses demo money: [compaki.vercel.app](https://compaki.vercel.app).

## What Compaki is

Producers who already sell together, such as a farmers' market, a
cooperative or a craft fair, have no simple way to sell online as a group.
Someone has to coordinate the orders, work out each person's share, set money
aside for shared goals and explain who received what.

Compaki lets any organizer launch a marketplace for their community in a few
minutes. Several sellers list their products in it, and every payment is
split automatically, in the same transaction, between:

- the **seller**;
- the **organizer**;
- a **community fund**;
- **Compaki**, which charges a fixed **2%**.

The organizer chooses what the community fund does:

| Mode | What happens to the community share |
| --- | --- |
| **Classic** | It goes straight, with every sale, to the community fund wallet the organizer names. |
| **Community Rewards** | It accumulates for a period (monthly to yearly; every 10 minutes on testnet, for demos), then returns to that period's buyers and sellers in proportion to what each one bought and sold, like a cooperative's dividend. |
| **Fundraising** | It accumulates until a target is reached, then pays fixed public recipients, such as a school or shared equipment, round after round. |

## Who benefits

- **Organizers** get a storefront for their community with the split, the
  fund and its rules handled for them, and receive their share directly.
- **Sellers** see what they will earn per unit before publishing, and are paid
  at the moment of each sale, not days later.
- **Buyers** sign in with email or Google, with no crypto wallet to install.
  In rewards marketplaces they get part of the fund back.
- **Communities** get a fund that grows with every sale, with rules and
  recipients anyone can check, instead of a spreadsheet someone has to
  explain.

## Why it matters

- **The rules run with the payment.** A Soroban smart contract applies the
  split and the fund's rules in the same transaction as the purchase. Nobody
  has to divide the money afterwards.
- **Anyone can verify it.** Every receipt links to its transaction on Stellar
  Expert, and the community page shows the fund, its periods or rounds, and
  who received what.
- **The fund pays for itself.** It is financed by a share of real sales, not
  by donations or a speculative token. Under the deployed contract code,
  nobody, including the organizer or Compaki, can withdraw it or change a
  running period's rules.
- **It feels like a normal store.** Sign-in with Google or email, prices in
  dollars, and one signature per payment.

## Stellar ecosystem tools used

| Tool | What Compaki uses it for |
| --- | --- |
| **Soroban** | One smart contract for every marketplace: the atomic split of each payment, the rewards treasury with its periods and claims, fundraising rounds, and in-place upgrades. [Contract README](contracts/marketplace/README.md) |
| **Stellar Asset Contract** | Lets the contract move `CPKUSD`, the demo payment asset. |
| **Scaffold Stellar** | Builds and optimizes the contract, and generates the typed TypeScript client the API uses to call it. CI checks the client matches the contract. |
| **Stellar SDK, RPC and Horizon** | The API prepares, simulates and submits transactions, and manages accounts and trustlines. [API README](apps/api/README.md#how-the-api-talks-to-stellar) |
| **Cavos** | Email and Google sign-in with an embedded Stellar wallet. Users sign their own launches, purchases and claims; Compaki never holds that key. |
| **Stellar Wallets Kit** | Sign-in and signing with existing wallets such as Freighter, xBull, Albedo and Lobstr. |
| **SEP-10** | Standard Stellar web authentication for wallet sign-in, also open to other Stellar clients. [Details](apps/api/README.md#sep-1-and-sep-10) |
| **SEP-1** | `stellar.toml` publishing Compaki's signing key, auth endpoint and the demo asset, marked as a test asset. |
| **Stellar Expert** | Public verification of every receipt, fund and contract. |
| **Friendbot** | Funds testnet accounts and the payers for deploys. |

## Status and limits

- **Testnet only.** Payments use `CPKUSD`, a demo asset Compaki issued on
  Stellar testnet. It is **not** Circle's USDC and has no value.
- **Upgradeable contract.** Its admin can replace the code, which is a trust
  trade-off; the guarantees hold for the deployed version.
- **Per-item checkout.** Each product payment is atomic; a cart of several
  items is settled as one payment per item.
- **Not yet validated with users.** Interviews and a first community pilot are
  the next step.

Details: [contract guarantees](contracts/marketplace/README.md#guarantees-and-limits)
and [sign-in and wallets](apps/api/README.md#sign-in-and-wallets).

## Repository

| Part | What it is |
| --- | --- |
| [`contracts/marketplace`](contracts/marketplace/README.md) | Soroban contract (Rust): split, rewards, fundraising, 44 tests. |
| [`apps/api`](apps/api/README.md) | Hono + Prisma API: the only part that talks to Stellar; sign-in, scheduler, deploy scripts. |
| [`apps/web`](apps/web/README.md) | Next.js app for buyers, sellers and organizers, in English and Spanish. |

To run it locally, start with the [API](apps/api/README.md#run-locally), then
the [web app](apps/web/README.md#run-locally). GitHub Actions builds and
tests all three parts on every push.

## Before and during the ideathon

**Before:** a Next.js frontend and Hono API, a Soroban contract with a
three-way split, the launch wizard, products, cart and checkout, receipts
linked to Stellar Expert, dashboards, custodial testnet accounts and 9
contract tests.

**During the ideathon** (October 24–25, 2026; see the git history):

- **Contract:** the three community modes; distributions anyone can trigger,
  with next-period rules scheduled by the organizer; sellers who register
  themselves; the fixed 2% fee; in-place upgrades; 9 → 44 tests, including
  strict authorization and mutation testing.
- **Stellar ecosystem:** Cavos and Stellar Wallets Kit sign-in, with users
  signing their own transactions; the organizer's own wallet as the on-chain
  operator; SEP-1 and SEP-10; Scaffold Stellar with a generated client; fee
  bumps for today's testnet fees.
- **Product:** rewards and fundraising dashboards, the public community page,
  the member rewards page, "My marketplaces", seller earnings preview, order
  fulfilment and tracking, no overselling or double charges, a redesign with
  dark mode, and English and Spanish throughout.
- **Security:** every account now signs with its own wallet (no server-held
  keys or passwords); a fix for account takeover in seller registration;
  signed, expiring `Secure` session cookies; CI for the contract, API and
  web.
