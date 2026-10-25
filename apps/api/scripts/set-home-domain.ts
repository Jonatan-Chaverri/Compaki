/**
 * Points the demo asset issuer's home_domain at the web app's domain, so
 * wallets and explorers (stellar.expert) find Compaki's stellar.toml (SEP-1)
 * and show the asset as Compaki's testnet demo asset, not USDC.
 *
 * Run: npm run stellar:home-domain -- compaki.example
 *      (defaults to HOME_DOMAIN; the domain must serve /.well-known/stellar.toml)
 */

import "./load-env";

import { Horizon, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import { stellarConfig } from "../src/lib/stellar";

async function main(): Promise<void> {
  const domain = (process.argv[2] ?? process.env.HOME_DOMAIN ?? "").trim();
  if (!domain || domain.includes("/") || domain.length > 32) {
    throw new Error("Usage: npm run stellar:home-domain -- <domain> (a host of at most 32 characters, no scheme or path)");
  }
  const res = await fetch(`${/^localhost(:\d+)?$/.test(domain) ? "http" : "https"}://${domain}/.well-known/stellar.toml`);
  const toml = res.ok ? await res.text() : "";
  if (!toml.includes(stellarConfig.usdcIssuerPublic)) {
    throw new Error(`${domain} doesn't serve a stellar.toml listing this issuer yet — deploy the web app first`);
  }

  const issuer = Keypair.fromSecret(stellarConfig.usdcIssuerSecret);
  const horizon = new Horizon.Server(stellarConfig.horizonUrl);
  const tx = new TransactionBuilder(await horizon.loadAccount(issuer.publicKey()), {
    fee: "1000",
    networkPassphrase: stellarConfig.networkPassphrase,
  })
    .addOperation(Operation.setOptions({ homeDomain: domain }))
    .setTimeout(60)
    .build();
  tx.sign(issuer);
  const result = await horizon.submitTransaction(tx);
  console.log(`✔ ${issuer.publicKey()} home_domain = ${domain} · tx ${result.hash}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
