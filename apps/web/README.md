# Compaki web app

Next.js (App Router) app for buyers, sellers and marketplace organizers. It
never talks to Stellar directly: it calls the [API](../api/README.md) through
its own `/api` proxy, and asks the user's wallet to sign the transactions the
API prepares.

[Back to the project overview](../../README.md)

> This project uses a recent Next.js with breaking changes. Read
> [`AGENTS.md`](../../AGENTS.md) and the guides in `node_modules/next/dist/docs/`
> before changing framework code.

## Run locally

```bash
cd apps/web
cp env.example .env.local   # then fill it in
npm install
npm run dev                 # http://localhost:3000 (proxies /api → API_URL, default :4000)
```

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_CAVOS_APP_ID` | Cavos app id (public). In the Cavos console, add the web origin under allowed origins. Without it, Cavos sign-in is hidden. |
| `NEXT_PUBLIC_CAVOS_ENV` | `development` (default) or `production`; must match the Cavos environment. |
| `API_URL` | Where `/api` and `/.well-known/stellar.toml` are proxied (default `http://localhost:4000`). |

## Pages

| Route | For | What it shows |
| --- | --- | --- |
| `/`, `/marketplaces` | Everyone | Home and the marketplace directory. |
| `/m/:slug` | Buyers | A marketplace's storefront, product pages (`/p/:id`), cart and checkout. Checkout settles one payment per cart item; the buyer's wallet signs each one. |
| `/m/:slug/community` | Everyone | The public community page: split percentages, fund balance, rewards periods or fundraising rounds, recipients and explorer links. |
| `/receipt/:saleId` | Buyers | A sale's receipt: what the seller, organizer, community fund and Compaki received, with a link to the transaction on Stellar Expert. |
| `/orders` | Buyers | My orders, with delivery status and tracking. |
| `/rewards` | Sellers and buyers | Rewards periods they took part in, with on-chain amounts and *Collect reward*. |
| `/onboarding` | Organizers | Launch wizard: revenue split, community mode (classic, rewards or fundraising) and its rules, including the wallet that receives a classic fund. The organizer's own wallet signs the launch. |
| `/dashboard`, `/dashboard/:slug` | Organizers | My marketplaces, and each one's dashboard: sales, sellers, the community story, and the rewards or fundraising tab with the next period's rules or target. |
| `/sell`, `/vendor` | Sellers | Becoming a seller, and the seller studio: products, the estimated earnings per unit before publishing, sales and delivery status. |
| `/login`, `/profile` | Everyone | Sign-in with Google, email or an existing wallet, and personal details. |

## Wallets

- **Cavos** ([`cavos-provider.tsx`](src/components/cavos-provider.tsx)):
  email or Google sign-in with an embedded Stellar wallet. The wallet signs
  the sign-in challenge, the account activation, the marketplace launch,
  purchases and reward claims (`signXdr`). Compaki never holds its key.
- **Stellar Wallets Kit** ([`stellar-wallets.ts`](src/lib/stellar-wallets.ts)):
  sign-in and signing with existing wallets such as Freighter, xBull, Albedo,
  Lobstr and Hana, through a SEP-10 challenge. The kit loads lazily, only in
  the browser.

When an action needs the user's signature, the API answers `202` with a
transaction; the page asks the wallet to sign it and sends it back to
`POST /api/tx/:id`.

## Languages and theme

The interface is available in English and Spanish with `next-intl`; see
[docs/i18n.md](../../docs/i18n.md). Messages live in
[`messages/en.json`](messages/en.json) and [`messages/es.json`](messages/es.json),
including translations of the API's error messages. Light and dark themes
follow the system unless the user picks one.

## SEP-1

[`next.config.ts`](next.config.ts) rewrites `/.well-known/stellar.toml` to
the API, so the file is served from the web app's domain, which is the
`HOME_DOMAIN` that SEP-10 and wallets expect.

## Tests

```bash
npm run typecheck && npm run lint && node --test tests/*.test.mjs && npm run build
```

The tests cover translations, theme, navigation, storefront filters, seller
earnings and the community fund view. They need neither the API nor
environment variables, and CI runs them on every push.
