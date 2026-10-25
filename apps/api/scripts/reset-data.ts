/**
 * Administrator tool: wipes the database for a clean demo. Deletes every
 * marketplace (with its vendors, products, orders, sales and rewards /
 * fundraising records) and every user except the --keep emails. Kept users
 * keep their account and wallets; whatever they bought or sold goes with the
 * marketplaces. On-chain state is not touched (testnet balances and contract
 * data stay where they are).
 *
 * Dry run by default: prints the target database and what would be deleted.
 *
 * Run: npm run data:reset -- --keep someone@example.com            (dry run)
 *      npm run data:reset -- --keep someone@example.com --confirm  (deletes)
 *
 * Back up first (pg_dump), and check the printed host: scripts read .env,
 * which may point at production.
 */

import "./load-env";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function argsOf(argv: string[]) {
  const keep: string[] = [];
  let confirm = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--confirm") confirm = true;
    else if (argv[i] === "--keep" && argv[i + 1]) keep.push(argv[++i].trim().toLowerCase());
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return { keep, confirm };
}

/** host/database of DATABASE_URL, without credentials. */
function target(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return "(DATABASE_URL not set)";
  }
}

async function main(): Promise<void> {
  const { keep, confirm } = argsOf(process.argv.slice(2));
  if (keep.length === 0) throw new Error("Pass at least one --keep <email> (the account to keep)");

  const kept = await prisma.user.findMany({ where: { email: { in: keep } }, select: { email: true } });
  const missing = keep.filter((email) => !kept.some((u) => u.email === email));
  if (missing.length > 0) throw new Error(`No user with email ${missing.join(", ")} — nothing deleted`);

  const users = { email: { notIn: keep } };
  const usersWithoutEmail = { email: null };
  const counts = {
    marketplaces: await prisma.marketplace.count(),
    vendorMemberships: await prisma.vendorMembership.count(),
    products: await prisma.product.count(),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    sales: await prisma.sale.count(),
    rewardClaims: await prisma.rewardClaim.count(),
    rewardsDistributions: await prisma.rewardsDistribution.count(),
    fundraiseReleases: await prisma.fundraiseRelease.count(),
    users: (await prisma.user.count({ where: users })) + (await prisma.user.count({ where: usersWithoutEmail })),
  };

  console.log(`Database: ${target()}`);
  console.log(`Keeping:  ${keep.join(", ")}`);
  console.log("Deleting:");
  for (const [table, count] of Object.entries(counts)) console.log(`  ${table.padEnd(22)} ${count}`);

  if (!confirm) {
    console.log("\nDry run — nothing deleted. Re-run with --confirm to delete.");
    return;
  }

  // Children first; one transaction, so a failure leaves everything as it was.
  await prisma.$transaction([
    prisma.rewardClaim.deleteMany(),
    prisma.rewardsDistribution.deleteMany(),
    prisma.fundraiseRelease.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.product.deleteMany(),
    prisma.vendorMembership.deleteMany(),
    prisma.marketplace.deleteMany(),
    prisma.user.deleteMany({ where: { OR: [users, usersWithoutEmail] } }),
  ]);
  console.log("\nDone.");
  console.log(`Remaining: ${await prisma.user.count()} user(s), ${await prisma.marketplace.count()} marketplace(s).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
