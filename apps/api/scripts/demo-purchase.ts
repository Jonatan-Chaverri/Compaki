/**
 * End-to-end smoke test against testnet:
 *   provisions operator / community fund / vendor / buyer custodial accounts,
 *   creates a marketplace (90% / 8% / 2%), registers the vendor,
 *   executes a $42 purchase, and prints balances + the stellar.expert link.
 *
 * Run: npm run demo:purchase   (requires `npm run deploy:testnet` first)
 */

import "./load-env";

import {
  createCustodialAccount,
  createMarketplace,
  decryptSecret,
  getMarketplace,
  getUsdBalance,
  purchase,
  registerVendor,
  stellarExpertTxUrl,
  usdToStroops,
} from "../src/lib/stellar";

const PRICE_USD = 42;

async function main(): Promise<void> {
  console.log("── Compaki demo purchase (testnet) ─────────────────────");

  console.log("Provisioning custodial accounts (Friendbot + trustlines)...");
  const [operator, communityFund, vendor, buyer] = await Promise.all([
    createCustodialAccount(),
    createCustodialAccount(),
    createCustodialAccount(),
    createCustodialAccount({ startingUsd: 100 }),
  ]);
  console.log(`  operator:       ${operator.publicKey}`);
  console.log(`  community fund: ${communityFund.publicKey}`);
  console.log(`  vendor:         ${vendor.publicKey}`);
  console.log(`  buyer:          ${buyer.publicKey} ($100.00 starting balance)`);

  console.log("Creating marketplace on-chain (90% vendor / 8% operator / 2% community)...");
  const { marketplaceId, txHash: createTx } = await createMarketplace({
    operatorSecret: decryptSecret(operator.secretEncrypted),
    communityFundPublicKey: communityFund.publicKey,
    vendorBps: 9_000,
    operatorBps: 800,
    communityBps: 200,
  });
  console.log(`  marketplace_id: ${marketplaceId} (tx ${createTx.slice(0, 8)}…)`);

  const config = await getMarketplace(marketplaceId);
  console.log(
    `  verified on-chain config: ${config.vendorBps}/${config.operatorBps}/${config.communityBps} bps`,
  );

  console.log("Registering vendor...");
  await registerVendor({
    operatorSecret: decryptSecret(operator.secretEncrypted),
    marketplaceId,
    vendorPublicKey: vendor.publicKey,
  });

  console.log(`Executing purchase of $${PRICE_USD.toFixed(2)}...`);
  const { txHash } = await purchase({
    buyerSecret: decryptSecret(buyer.secretEncrypted),
    marketplaceId,
    vendorPublicKey: vendor.publicKey,
    amountStroops: usdToStroops(PRICE_USD),
  });

  const [vendorBal, operatorBal, communityBal, buyerBal] = await Promise.all([
    getUsdBalance(vendor.publicKey),
    getUsdBalance(operator.publicKey),
    getUsdBalance(communityFund.publicKey),
    getUsdBalance(buyer.publicKey),
  ]);

  console.log("────────────────────────────────────────────────────────");
  console.log("Resulting balances:");
  console.log(`  vendor:         $${vendorBal.toFixed(2)}   (expected $37.80)`);
  console.log(`  operator:       $${operatorBal.toFixed(2)}    (expected $3.36)`);
  console.log(`  community fund: $${communityBal.toFixed(2)}    (expected $0.84)`);
  console.log(`  buyer:          $${buyerBal.toFixed(2)}   (expected $58.00)`);
  console.log("");
  console.log(`✔ Transparent receipt: ${stellarExpertTxUrl(txHash)}`);
}

main().catch((error) => {
  console.error("Demo purchase failed:", error);
  process.exit(1);
});
