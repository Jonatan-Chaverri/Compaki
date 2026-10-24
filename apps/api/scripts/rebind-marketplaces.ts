/**
 * Binds existing marketplaces to the contract in MARKETPLACE_CONTRACT_ID.
 *
 * On-chain marketplace ids only mean something inside one contract
 * deployment, and the API refuses to use a marketplace whose
 * Marketplace.contractId differs from the configured contract. After a
 * contract redeploy (`npm run deploy:testnet -- --contract-only`) run this to
 * re-register every marketplace and its vendors in the new contract:
 *
 *   npm run marketplaces:rebind -- --dry-run
 *   npm run marketplaces:rebind -- --rewards cafe-de-altura,other-slug
 *
 *   --rewards a,b   register these slugs as Community Rewards marketplaces
 *                   (community share held by the contract). Marketplaces
 *                   already flagged rewardsEnabled are always registered so.
 *   --adopt         no redeploy happened: just stamp rows that have no
 *                   contractId yet with the current contract (their ids are
 *                   already valid there). Never re-registers anything.
 *   --dry-run       print the plan, change nothing.
 *
 * Splits are re-registered exactly as stored. Funds already paid out under
 * the old contract stay where they are (old community fund accounts keep
 * their balances); sale history and receipts are untouched.
 *
 * Safe to re-run: a marketplace is only updated after its on-chain
 * registration and all its vendor registrations succeeded. A crash midway
 * leaves at most an unused marketplace entry in the new contract.
 */

import "./load-env";

import { PrismaClient } from "@prisma/client";

import {
  createMarketplace,
  createRewardsMarketplace,
  decryptSecret,
  registerVendor,
  stellarConfig,
} from "../src/lib/stellar";

const prisma = new PrismaClient();

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const contractId = stellarConfig.marketplaceContractId;
  const dryRun = process.argv.includes("--dry-run");
  const rewardsSlugs = new Set(
    (argValue("--rewards") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  console.log(`── Rebinding marketplaces to ${contractId}${dryRun ? " (dry run)" : ""}`);

  if (process.argv.includes("--adopt")) {
    const rows = await prisma.marketplace.findMany({
      where: { contractId: null, contractMarketplaceId: { not: null } },
      select: { slug: true },
    });
    console.log(`Adopting ${rows.length} marketplace(s): ${rows.map((r) => r.slug).join(", ") || "—"}`);
    if (!dryRun) {
      await prisma.marketplace.updateMany({
        where: { contractId: null, contractMarketplaceId: { not: null } },
        data: { contractId },
      });
    }
    return;
  }

  const marketplaces = await prisma.marketplace.findMany({
    where: { OR: [{ contractId: null }, { contractId: { not: contractId } }] },
    include: {
      operator: true,
      communityFund: true,
      vendors: { include: { user: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (marketplaces.length === 0) {
    console.log("Nothing to do — every marketplace is bound to this contract.");
    return;
  }

  for (const m of marketplaces) {
    const rewards = m.rewardsEnabled || rewardsSlugs.has(m.slug);
    const mode = rewards ? "Community Rewards" : "classic";
    console.log(
      `• ${m.slug}: ${m.splitVendorBps}/${m.splitOperatorBps}/${m.splitCommunityBps} bps, ${mode}, ${m.vendors.length} vendor(s)`,
    );
    if (!m.operator.stellarSecretEncrypted) {
      console.log("    skipped: operator has no payment account");
      continue;
    }
    if (rewards && m.splitCommunityBps === 0) {
      console.log("    skipped: Community Rewards needs a community share above 0%");
      continue;
    }
    if (!rewards && !m.communityFund?.stellarPublicKey) {
      console.log("    skipped: classic marketplace without a community fund account");
      continue;
    }
    if (dryRun) continue;

    const operatorSecret = decryptSecret(m.operator.stellarSecretEncrypted);
    const split = {
      operatorSecret,
      vendorBps: m.splitVendorBps,
      operatorBps: m.splitOperatorBps,
      communityBps: m.splitCommunityBps,
    };
    const created = rewards
      ? await createRewardsMarketplace(split)
      : await createMarketplace({
          ...split,
          communityFundPublicKey: m.communityFund!.stellarPublicKey!,
        });
    console.log(`    marketplace_id ${created.marketplaceId} · tx ${created.txHash}`);

    const vendorTx: { membershipId: string; txHash: string }[] = [];
    for (const v of m.vendors) {
      const vendorAddress = v.payoutAddress ?? v.user.stellarPublicKey;
      if (!vendorAddress) {
        console.log(`    vendor ${v.user.name}: no payment account, skipped`);
        continue;
      }
      const { txHash } = await registerVendor({
        operatorSecret,
        marketplaceId: created.marketplaceId,
        vendorPublicKey: vendorAddress,
      });
      vendorTx.push({ membershipId: v.id, txHash });
      console.log(`    vendor ${v.user.name} · tx ${txHash}`);
    }

    await prisma.$transaction([
      prisma.marketplace.update({
        where: { id: m.id },
        data: {
          contractId,
          contractMarketplaceId: created.marketplaceId.toString(),
          createTxHash: created.txHash,
          rewardsEnabled: rewards,
          regenerativeEnabled: m.regenerativeEnabled || rewards,
        },
      }),
      ...vendorTx.map((v) =>
        prisma.vendorMembership.update({
          where: { id: v.membershipId },
          data: { registerTxHash: v.txHash },
        }),
      ),
    ]);
  }
  console.log("✔ Done.");
}

main()
  .catch((error) => {
    console.error("Rebind failed (safe to re-run):", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
