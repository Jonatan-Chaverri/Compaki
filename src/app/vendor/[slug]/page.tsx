import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/shell";
import { prisma, parseSplitSnapshot } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

import { VendorDashboard, type SaleRow, type ProductRow } from "./vendor-dashboard";

export const dynamic = "force-dynamic";

export default async function VendorPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, splitVendorBps: true },
  });
  if (!marketplace) notFound();

  const user = await getSessionUser();
  const membership = user
    ? await prisma.vendorMembership.findUnique({
        where: { marketplaceId_userId: { marketplaceId: marketplace.id, userId: user.id } },
      })
    : null;

  if (!user || !membership || !user.stellarPublicKey) {
    return (
      <div className="min-h-screen bg-slate-50/60">
        <AppHeader />
        <main className="mx-auto w-full max-w-xl px-6 py-20 text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            You&apos;re not a vendor here (yet)
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Register as a vendor of {marketplace.name} to manage products and see your sales.
          </p>
          <Link
            href={`/m/${slug}/join`}
            className="mt-6 inline-block rounded-full bg-slate-900 px-7 py-3 text-sm font-medium text-white hover:bg-slate-700"
          >
            Become a vendor
          </Link>
        </main>
      </div>
    );
  }

  const products = await prisma.product.findMany({
    where: { marketplaceId: marketplace.id, vendorId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const sales = await prisma.sale.findMany({
    where: { product: { marketplaceId: marketplace.id, vendorId: user.id } },
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const productRows: ProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priceUsd: p.priceUsd,
    imageUrl: p.imageUrl,
  }));
  const saleRows: SaleRow[] = sales.map((s) => {
    let vendorShareUsd = s.amountUsd;
    try {
      vendorShareUsd = parseSplitSnapshot(s.splitSnapshot).vendorAmountUsd;
    } catch {
      // legacy/malformed snapshot — fall back to gross
    }
    return {
      id: s.id,
      productName: s.product.name,
      amountUsd: s.amountUsd,
      vendorShareUsd,
      txHash: s.txHash,
      createdAt: s.createdAt.toISOString(),
    };
  });

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AppHeader
        right={
          <span className="text-sm text-slate-500">
            {user.name} · vendor at{" "}
            <span className="font-medium text-slate-700">{marketplace.name}</span>
          </span>
        }
      />
      <VendorDashboard
        slug={marketplace.slug}
        marketplaceName={marketplace.name}
        vendorAccount={user.stellarPublicKey}
        vendorBps={marketplace.splitVendorBps}
        products={productRows}
        sales={saleRows}
      />
    </div>
  );
}
