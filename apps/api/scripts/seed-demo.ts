/**
 * Demo seed — builds the full SCF pitch scenario against REAL testnet:
 *
 *   Marketplace "Café de Altura" (regenerative, 85/10/5 split)
 *   ├─ operator María Castillo
 *   ├─ vendors Don Carlos (coffee) and Finca La Esperanza (2-3 products each)
 *   └─ 5 historical sales with real on-chain transactions
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

import type { SplitSnapshot } from "../src/lib/db/types";
import {
  createCustodialAccount,
  createMarketplace,
  decryptSecret,
  purchase,
  registerVendor,
  stellarExpertTxUrl,
  stroopsToUsd,
  usdToStroops,
} from "../src/lib/stellar";

const prisma = new PrismaClient();

const SLUG = "cafe-de-altura";
const SPLITS = { vendorBps: 8_500, operatorBps: 1_000, communityBps: 500 };
const SALES_TARGET = 5;

const VENDORS = [
  {
    name: "Don Carlos",
    email: "don.carlos@cafedealtura.example",
    sells: "Single-origin coffee from my own field in Tarrazú",
    products: [
      {
        name: "Café Tarrazú, 340g",
        description: "Washed arabica grown at 1,800m — chocolate and citrus notes.",
        priceUsd: 14,
        imageUrl: "☕",
      },
      {
        name: "Honey-process microlot, 250g",
        description: "Limited harvest, sun-dried on raised beds. Sweet and floral.",
        priceUsd: 18.5,
        imageUrl: "🫘",
      },
      {
        name: "Coffee blossom honey, 300g",
        description: "From hives that pollinate the coffee plants every spring.",
        priceUsd: 9,
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
        description: "Dried coffee cherry husk — brews like hibiscus, tastes like plum.",
        priceUsd: 7.5,
        imageUrl: "🍵",
      },
      {
        name: "Cacao nibs, 250g",
        description: "Fermented and roasted on the farm. Intense, barely bitter.",
        priceUsd: 11,
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

  // ── 1. Operator + community fund + marketplace ────────────────────────
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
      operatorId: operator.id,
    },
    include: { communityFund: true },
  });

  let fund = marketplace.communityFund;
  if (!fund?.stellarPublicKey) {
    const account = await createCustodialAccount();
    fund = fund
      ? await prisma.user.update({
          where: { id: fund.id },
          data: {
            stellarPublicKey: account.publicKey,
            stellarSecretEncrypted: account.secretEncrypted,
          },
        })
      : await prisma.user.create({
          data: {
            name: "Escuela Verde de Tarrazú",
            role: "COMMUNITY",
            stellarPublicKey: account.publicKey,
            stellarSecretEncrypted: account.secretEncrypted,
          },
        });
    marketplace = await prisma.marketplace.update({
      where: { id: marketplace.id },
      data: { communityFundId: fund.id },
      include: { communityFund: true },
    });
  }

  if (!marketplace.contractMarketplaceId) {
    console.log("Registering marketplace on-chain (85/10/5)...");
    const result = await createMarketplace({
      operatorSecret: decryptSecret(operator.stellarSecretEncrypted as string),
      communityFundPublicKey: fund.stellarPublicKey as string,
      ...SPLITS,
    });
    marketplace = await prisma.marketplace.update({
      where: { id: marketplace.id },
      data: {
        contractMarketplaceId: result.marketplaceId.toString(),
        createTxHash: result.txHash,
      },
      include: { communityFund: true },
    });
    console.log(`  create_marketplace tx ${result.txHash.slice(0, 8)}…`);
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

  // ── 3. Historical sales (real on-chain purchases) ─────────────────────
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
    const { txHash } = await purchase({
      buyerSecret: decryptSecret(buyer.stellarSecretEncrypted as string),
      marketplaceId: contractMarketplaceId,
      vendorPublicKey: product.vendor.stellarPublicKey as string,
      amountStroops,
    });
    const settleSeconds = Math.max(1, Math.round((Date.now() - settleStart) / 1000));

    const vendorStroops = (amountStroops * BigInt(SPLITS.vendorBps)) / 10_000n;
    const operatorStroops = (amountStroops * BigInt(SPLITS.operatorBps)) / 10_000n;
    const snapshot: SplitSnapshot = {
      vendorBps: SPLITS.vendorBps,
      operatorBps: SPLITS.operatorBps,
      communityBps: SPLITS.communityBps,
      vendorAmountUsd: stroopsToUsd(vendorStroops),
      operatorAmountUsd: stroopsToUsd(operatorStroops),
      communityAmountUsd: stroopsToUsd(amountStroops - vendorStroops - operatorStroops),
    };

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

  // ── 4. Summary for the presenter ──────────────────────────────────────
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
