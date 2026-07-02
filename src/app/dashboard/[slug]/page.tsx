import { notFound } from "next/navigation";

import { AppHeader } from "@/components/shell";
import { prisma, parseSplitSnapshot } from "@/lib/db";

import {
  OperatorDashboard,
  type CatalogRow,
  type SaleFeedRow,
  type VendorRow,
} from "./operator-dashboard";

export const dynamic = "force-dynamic";

export default async function OperatorPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug },
    include: {
      operator: { select: { id: true, name: true, stellarPublicKey: true } },
      communityFund: { select: { id: true, name: true, stellarPublicKey: true } },
      vendors: {
        include: {
          user: { select: { id: true, name: true, email: true, stellarPublicKey: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      products: {
        include: { vendor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!marketplace) notFound();

  const sales = await prisma.sale.findMany({
    where: { product: { marketplaceId: marketplace.id } },
    include: {
      product: { select: { name: true, vendor: { select: { name: true } } } },
      buyer: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Revenue by recipient, from the split snapshots frozen at purchase time.
  const parseSplitOrFallback = (raw: string, amountUsd: number) => {
    try {
      return parseSplitSnapshot(raw);
    } catch {
      // malformed snapshot — count everything as vendor share
      return { vendorAmountUsd: amountUsd, operatorAmountUsd: 0, communityAmountUsd: 0 };
    }
  };
  const splitsPerSale = sales.map((s) => parseSplitOrFallback(s.splitSnapshot, s.amountUsd));
  const sum = (pick: (s: (typeof splitsPerSale)[number]) => number) =>
    splitsPerSale.reduce((acc, s) => acc + pick(s), 0);
  const grossVolume = sales.reduce((acc, s) => acc + s.amountUsd, 0);
  const vendorRevenue = sum((s) => s.vendorAmountUsd);
  const operatorRevenue = sum((s) => s.operatorAmountUsd);
  const communityRevenue = sum((s) => s.communityAmountUsd);

  const saleFeed: SaleFeedRow[] = sales.map((s) => ({
    id: s.id,
    productName: s.product.name,
    vendorName: s.product.vendor.name,
    buyerName: s.buyer.name,
    amountUsd: s.amountUsd,
    txHash: s.txHash,
    createdAt: s.createdAt.toISOString(),
  }));

  const vendorRows: VendorRow[] = marketplace.vendors.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email ?? "",
    sells: m.sellsDescription,
    account: m.user.stellarPublicKey,
    registerTxHash: m.registerTxHash,
    joinedAt: m.createdAt.toISOString(),
    productCount: marketplace.products.filter((p) => p.vendorId === m.user.id).length,
  }));

  const catalog: CatalogRow[] = marketplace.products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priceUsd: p.priceUsd,
    imageUrl: p.imageUrl,
    vendorName: p.vendor.name,
  }));

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader
        right={
          <span className="text-sm text-slate-500">
            Operator dashboard ·{" "}
            <span className="font-medium text-slate-700">{marketplace.name}</span>
          </span>
        }
      />
      <OperatorDashboard
        name={marketplace.name}
        slug={marketplace.slug}
        regenerativeEnabled={marketplace.regenerativeEnabled}
        splits={{
          vendorBps: marketplace.splitVendorBps,
          operatorBps: marketplace.splitOperatorBps,
          communityBps: marketplace.splitCommunityBps,
        }}
        operatorAccount={marketplace.operator.stellarPublicKey}
        communityAccount={marketplace.communityFund?.stellarPublicKey ?? null}
        stats={{
          totalSales: sales.length,
          grossVolume,
          vendorRevenue,
          operatorRevenue,
          communityRevenue,
        }}
        sales={saleFeed}
        vendors={vendorRows}
        catalog={catalog}
      />
    </div>
  );
}
