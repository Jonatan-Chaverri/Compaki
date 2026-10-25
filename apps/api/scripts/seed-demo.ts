/**
 * Demo seed — builds the full pitch scenario against REAL testnet:
 *
 *   Marketplace "Café de Altura" (Community Rewards, 83/10/5 split + Compaki's 2%)
 *   ├─ operator María Castillo
 *   ├─ vendors Don Carlos (coffee) and Finca La Esperanza (2-3 products each)
 *   ├─ community members Escuela Verde (50%), Brigada de Reforestación (30%)
 *   │  and Lucía Fernández (20%), in an open rewards period
 *   └─ 5 historical sales with real on-chain transactions (their community
 *      share is booked to that period in the contract treasury)
 *
 * DEMO_SEED_PASSWORD=<pw> gives every seeded user that password (only users
 * that have none yet), so the presenter can sign in as operator, vendor or
 * member. SEED_PERIOD_MINUTES (default 10) sets the period length.
 *
 * Idempotent: users are reused by email, the marketplace by slug, on-chain
 * steps are skipped when their tx hash is already stored, and sales are only
 * created until the marketplace has SALES_TARGET of them. Safe to re-run if
 * testnet hiccups halfway.
 *
 * Run: npm run demo:seed   (requires `npm run deploy:testnet` first)
 */

import "./load-env";

import { PrismaClient, type User } from "@prisma/client";

import { splitSnapshot } from "../src/lib/splits";
import { hashPassword } from "../src/lib/passwords";
import { boundOnChainId } from "../src/lib/rewards";
import {
  createCustodialAccount,
  createRewardsMarketplace,
  decryptSecret,
  getRewardsPeriod,
  getRewardsStatus,
  openRewardsPeriod,
  purchase,
  registerVendor,
  stellarConfig,
  stellarExpertTxUrl,
  stroopsToUsd,
  usdToStroops,
} from "../src/lib/stellar";

const prisma = new PrismaClient();

const SLUG = "cafe-de-altura";
// Shares of the 98% left after Compaki's fixed 2% platform fee.
const SPLITS = { vendorBps: 8_300, operatorBps: 1_000, communityBps: 500 };
const SALES_TARGET = 5;
const PERIOD_MINUTES = Number(process.env.SEED_PERIOD_MINUTES ?? 10);
const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD ?? "";

const MEMBERS = [
  { name: "Escuela Verde de Tarrazú", email: "escuela@cafedealtura.example", shareBps: 5_000 },
  { name: "Brigada de Reforestación", email: "brigada@cafedealtura.example", shareBps: 3_000 },
  { name: "Lucía Fernández", email: "lucia@example.com", shareBps: 2_000 },
] as const;

const VENDORS = [
  {
    name: "Don Carlos",
    email: "don.carlos@cafedealtura.example",
    sells: "Single-origin coffee from my own field in Tarrazú",
    products: [
      {
        name: "Café Tarrazú, 340g",
        shortDescription: "Washed arabica — chocolate and citrus notes.",
        description:
          "Washed arabica grown at 1,800m in Tarrazú. Hand-picked, sun-dried and roasted in small batches the same week it ships. Expect chocolate and citrus notes with a clean, sweet finish.",
        priceUsd: 14,
        stock: 25,
        imageUrl: "☕",
      },
      {
        name: "Honey-process microlot, 250g",
        shortDescription: "Limited harvest, sweet and floral.",
        description:
          "Limited harvest microlot, honey-processed and sun-dried on raised beds. Only a few sacks exist each season — sweet, floral, and unmistakably Tarrazú.",
        priceUsd: 18.5,
        stock: 10,
        imageUrl: "🫘",
      },
      {
        name: "Coffee blossom honey, 300g",
        shortDescription: "From hives among the coffee plants.",
        description:
          "Raw honey from hives that pollinate the coffee plants every spring. Light, aromatic, and never heated or filtered.",
        priceUsd: 9,
        stock: 40,
        imageUrl: "🍯",
      },
    ],
  },
  {
    name: "Finca La Esperanza",
    email: "hola@fincalaesperanza.example",
    sells: "Family farm — coffee, cascara and cacao",
    products: [
      {
        name: "Cascara tea, 200g",
        shortDescription: "Brews like hibiscus, tastes like plum.",
        description:
          "Dried coffee cherry husk from our own harvest — brews like hibiscus, tastes like plum. Naturally caffeinated and endlessly re-steepable.",
        priceUsd: 7.5,
        stock: 30,
        imageUrl: "🍵",
      },
      {
        name: "Cacao nibs, 250g",
        shortDescription: "Farm-fermented, intense, barely bitter.",
        description:
          "Cacao fermented and roasted on the farm. Intense, barely bitter, perfect over yogurt or straight from the bag.",
        priceUsd: 11,
        stock: 20,
        imageUrl: "🍫",
      },
    ],
  },
] as const;

const BUYERS = [
  { name: "Lucía Fernández", email: "lucia@example.com" },
  { name: "Marco Solís", email: "marco@example.com" },
  { name: "Emma Thompson", email: "emma@example.com" },
] as const;

/** Users are reused by email; the custodial account is provisioned once. */
async function ensureUser(params: {
  name: string;
  email: string;
  role: string;
  startingUsd?: number;
}): Promise<User> {
  let user = await prisma.user.upsert({
    where: { email: params.email },
    update: { name: params.name },
    create: { email: params.email, name: params.name, role: params.role },
  });
  if (DEMO_PASSWORD && !user.passwordHash) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(DEMO_PASSWORD) },
    });
  }
  if (!user.stellarPublicKey || !user.stellarSecretEncrypted) {
    const account = await createCustodialAccount({ startingUsd: params.startingUsd });
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        stellarPublicKey: account.publicKey,
        stellarSecretEncrypted: account.secretEncrypted,
      },
    });
  }
  return user;
}

async function main(): Promise<void> {
  console.log("── Compaki demo seed: Café de Altura (testnet) ─────────");
  if (DEMO_PASSWORD && DEMO_PASSWORD.length < 8) {
    throw new Error("DEMO_SEED_PASSWORD must be at least 8 characters");
  }

  // ── 1. Operator + marketplace (Community Rewards) ─────────────────────
  console.log("Operator María + payment accounts...");
  const operator = await ensureUser({
    name: "María Castillo",
    email: "maria@cafedealtura.example",
    role: "OPERATOR",
  });

  let marketplace = await prisma.marketplace.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      name: "Café de Altura",
      slug: SLUG,
      description: "High-altitude coffee and farm goods, straight from Tarrazú growers.",
      category: "Coffee & agriculture",
      splitVendorBps: SPLITS.vendorBps,
      splitOperatorBps: SPLITS.operatorBps,
      splitCommunityBps: SPLITS.communityBps,
      regenerativeEnabled: true,
      rewardsEnabled: true,
      operatorId: operator.id,
    },
  });

  if (marketplace.contractMarketplaceId && boundOnChainId(marketplace) === null) {
    throw new Error(
      `${SLUG} is registered in another contract deployment. Run \`npm run marketplaces:rebind -- --rewards ${SLUG}\` first.`,
    );
  }
  if (!marketplace.contractMarketplaceId) {
    console.log("Registering Community Rewards marketplace on-chain (83/10/5 + 2% Compaki)...");
    const result = await createRewardsMarketplace({
      operatorSecret: decryptSecret(operator.stellarSecretEncrypted as string),
      ...SPLITS,
    });
    marketplace = await prisma.marketplace.update({
      where: { id: marketplace.id },
      data: {
        contractMarketplaceId: result.marketplaceId.toString(),
        contractId: stellarConfig.marketplaceContractId,
        createTxHash: result.txHash,
        rewardsEnabled: true,
      },
    });
    console.log(`  create_rewards_marketplace tx ${result.txHash.slice(0, 8)}…`);
  }
  const contractMarketplaceId = BigInt(marketplace.contractMarketplaceId as string);

  // ── 2. Vendors + products ─────────────────────────────────────────────
  const vendorUsers: User[] = [];
  for (const v of VENDORS) {
    console.log(`Vendor ${v.name}...`);
    const vendor = await ensureUser({ name: v.name, email: v.email, role: "VENDOR" });
    vendorUsers.push(vendor);

    let membership = await prisma.vendorMembership.upsert({
      where: {
        marketplaceId_userId: { marketplaceId: marketplace.id, userId: vendor.id },
      },
      update: {},
      create: {
        marketplaceId: marketplace.id,
        userId: vendor.id,
        sellsDescription: v.sells,
      },
    });
    if (!membership.registerTxHash) {
      const { txHash } = await registerVendor({
        operatorSecret: decryptSecret(operator.stellarSecretEncrypted as string),
        marketplaceId: contractMarketplaceId,
        vendorPublicKey: vendor.stellarPublicKey as string,
      });
      membership = await prisma.vendorMembership.update({
        where: { id: membership.id },
        data: { registerTxHash: txHash },
      });
      console.log(`  register_vendor tx ${txHash.slice(0, 8)}…`);
    }

    for (const p of v.products) {
      const existing = await prisma.product.findFirst({
        where: { marketplaceId: marketplace.id, vendorId: vendor.id, name: p.name },
      });
      if (!existing) {
        await prisma.product.create({
          data: { ...p, marketplaceId: marketplace.id, vendorId: vendor.id },
        });
      }
    }
  }

  // ── 3. Community members + an open rewards period ─────────────────────
  if (marketplace.rewardsEnabled) {
    const members: User[] = [];
    for (const m of MEMBERS) {
      members.push(await ensureUser({ name: m.name, email: m.email, role: "BUYER", startingUsd: 100 }));
    }
    const status = await getRewardsStatus(contractMarketplaceId);
    const latest =
      status.periodCount > 0
        ? await getRewardsPeriod(contractMarketplaceId, status.periodCount - 1)
        : null;
    if (!latest || status.ledgerTime >= latest.endTs) {
      console.log(`Opening a ${PERIOD_MINUTES}-minute rewards period (50/30/20)...`);
      const opened = await openRewardsPeriod({
        operatorSecret: decryptSecret(operator.stellarSecretEncrypted as string),
        marketplaceId: contractMarketplaceId,
        beneficiaries: members.map((m) => m.stellarPublicKey as string),
        sharesBps: MEMBERS.map((m) => m.shareBps),
        endTs: status.ledgerTime + PERIOD_MINUTES * 60,
      });
      await prisma.rewardsPeriod.create({
        data: {
          marketplaceId: marketplace.id,
          contractId: stellarConfig.marketplaceContractId,
          periodId: opened.periodId,
          openTxHash: opened.txHash,
        },
      });
      console.log(`  open_period #${opened.periodId} tx ${opened.txHash.slice(0, 8)}…`);
    } else {
      console.log(`Rewards period #${status.periodCount - 1} is already running.`);
    }
  }

  // ── 4. Historical sales (real on-chain purchases) ─────────────────────
  const existingSales = await prisma.sale.count({
    where: { product: { marketplaceId: marketplace.id } },
  });
  const salesToCreate = Math.max(0, SALES_TARGET - existingSales);
  console.log(
    `Sales: ${existingSales} already recorded, creating ${salesToCreate} more...`,
  );

  const products = await prisma.product.findMany({
    where: { marketplaceId: marketplace.id },
    include: { vendor: true },
    orderBy: { createdAt: "asc" },
  });

  const buyers: User[] = [];
  for (const b of BUYERS) {
    buyers.push(await ensureUser({ ...b, role: "BUYER", startingUsd: 100 }));
  }

  const receipts: { label: string; saleId: string; txHash: string }[] = [];
  for (let i = 0; i < salesToCreate; i++) {
    const product = products[i % products.length];
    const buyer = buyers[i % buyers.length];
    console.log(
      `  ${buyer.name} buys "${product.name}" ($${product.priceUsd.toFixed(2)})...`,
    );

    const amountStroops = usdToStroops(product.priceUsd);
    const settleStart = Date.now();
    const { txHash, rewardsPeriodId } = await purchase({
      buyerSecret: decryptSecret(buyer.stellarSecretEncrypted as string),
      marketplaceId: contractMarketplaceId,
      vendorPublicKey: product.vendor.stellarPublicKey as string,
      amountStroops,
    });
    const settleSeconds = Math.max(1, Math.round((Date.now() - settleStart) / 1000));

    const snapshot = splitSnapshot(amountStroops, SPLITS, rewardsPeriodId);

    // Backdate so the dashboard reads like an operating store, not a fresh seed.
    const hoursAgo = (salesToCreate - i) * 11 + 3;
    const sale = await prisma.sale.create({
      data: {
        amountUsd: product.priceUsd,
        txHash,
        splitSnapshot: JSON.stringify(snapshot),
        settleSeconds,
        productId: product.id,
        buyerId: buyer.id,
        createdAt: new Date(Date.now() - hoursAgo * 3_600_000),
      },
    });
    receipts.push({ label: `${product.name} — $${product.priceUsd.toFixed(2)}`, saleId: sale.id, txHash });
    console.log(`    settled in ${settleSeconds}s · tx ${txHash.slice(0, 8)}…`);
  }

  // ── 5. Summary for the presenter ──────────────────────────────────────
  const allSales = await prisma.sale.findMany({
    where: { product: { marketplaceId: marketplace.id } },
    orderBy: { createdAt: "desc" },
    include: { product: { select: { name: true } } },
  });
  console.log("────────────────────────────────────────────────────────");
  console.log("✔ Café de Altura is ready. Save these links for the demo:");
  console.log(`  Storefront:         http://localhost:3000/m/${SLUG}`);
  console.log(`  Operator dashboard: http://localhost:3000/dashboard/${SLUG}`);
  console.log(`  Vendor invite:      http://localhost:3000/m/${SLUG}/join`);
  console.log(`  Member rewards:     http://localhost:3000/rewards`);
  console.log(
    `  Sign-ins:           ${operator.email} (operator), ${MEMBERS.map((m) => m.email).join(", ")} (members)` +
      (DEMO_PASSWORD ? " — password from DEMO_SEED_PASSWORD" : " — set DEMO_SEED_PASSWORD to enable"),
  );
  for (const s of allSales) {
    console.log(
      `  Receipt · ${s.product.name}: http://localhost:3000/receipt/${s.id}`,
    );
    console.log(`    on-chain: ${stellarExpertTxUrl(s.txHash)}`);
  }
}

main()
  .catch((error) => {
    console.error("Demo seed failed (safe to re-run):", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
