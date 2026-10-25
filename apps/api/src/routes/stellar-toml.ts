// GET /.well-known/stellar.toml — SEP-1 (https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md).
//
// Tells wallets and explorers who Compaki is and what its accounts and asset
// are: the SEP-10 signing key and web auth endpoint, the demo asset (clearly
// marked as a testnet demo asset, not Circle's USDC) with its token contract,
// and the accounts Compaki operates. The web app serves it from its own
// domain (HOME_DOMAIN) through a rewrite; the demo asset's issuer points its
// home_domain there (`npm run stellar:home-domain`), which is how explorers
// find this file.

import { Hono } from "hono";

import { homeDomain, homeOrigin, signingKeypair, webAuthEndpoint } from "@/lib/sep10";
import { stellarConfig, stellarExpertContractUrl } from "@/lib/stellar";

export const stellarToml = new Hono();

/** A TOML basic string. */
function str(value: string): string {
  return JSON.stringify(value);
}

stellarToml.get("/stellar.toml", (c) => {
  const origin = homeOrigin();
  const accounts = [stellarConfig.usdcIssuerPublic, process.env.PLATFORM_FEE_PUBLIC].filter(
    (a): a is string => Boolean(a),
  );
  const code = stellarConfig.usdcCode;
  const toml = `# Compaki — ${homeDomain()}
VERSION = "2.7.0"
NETWORK_PASSPHRASE = ${str(stellarConfig.networkPassphrase)}
SIGNING_KEY = ${str(signingKeypair().publicKey())}
WEB_AUTH_ENDPOINT = ${str(webAuthEndpoint())}
ACCOUNTS = [${accounts.map(str).join(", ")}]

[DOCUMENTATION]
ORG_NAME = "Compaki"
ORG_URL = ${str(origin)}
ORG_LOGO = ${str(`${origin}/logo.png`)}
ORG_DESCRIPTION = ${str(
    "Multi-vendor marketplaces for communities on Stellar. Every sale is split on-chain between the seller, " +
      "the marketplace, a community fund and Compaki's 2% fee, by the Soroban contract " +
      `${stellarConfig.marketplaceContractId} (${stellarExpertContractUrl(stellarConfig.marketplaceContractId)}).`,
  )}

[[CURRENCIES]]
code = ${str(code)}
issuer = ${str(stellarConfig.usdcIssuerPublic)}
contract = ${str(stellarConfig.usdcSacAddress)}
status = "test"
display_decimals = 2
name = ${str(`Compaki demo dollar (${code})`)}
desc = ${str(
    `Demo asset issued by Compaki on Stellar testnet so purchases can be tried for free. It is NOT Circle's USDC, ` +
      "is not backed by anything and has no value. Its issuer has no clawback or freeze flags.",
  )}
is_asset_anchored = false
image = ${str(`${origin}/logo.png`)}
`;
  c.header("Content-Type", "text/plain; charset=utf-8");
  // SEP-1: wallets fetch it from other origins.
  c.header("Access-Control-Allow-Origin", "*");
  return c.body(toml);
});
