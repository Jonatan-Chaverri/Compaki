"use client";
import { useLocale } from "next-intl";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/shell";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./vendor-dashboard.module.css";

import { FulfillmentActions, FulfillmentBadge, FulfillmentDetails } from "@/components/fulfillment";
import { LiveBalance } from "@/components/live-balance";
import { Modal, ProductModal } from "@/components/product-modal";
import { ProductVisual } from "@/components/shell";
import { formatDateTime, formatUsd } from "@/lib/format";
import type { Fulfillment } from "@/lib/fulfillment";

export interface ProductRow {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  priceUsd: number;
  stock: number;
  imageUrl: string | null;
  visibility: "PUBLISHED" | "HIDDEN";
  marketplace: { name: string; slug: string };
}

export interface SellerMarketplace { name: string; slug: string; vendorBps: number; }

export interface SaleRow {
  id: string;
  productName: string;
  marketplace: { name: string; slug: string };
  quantity: number;
  amountUsd: number;
  vendorShareUsd: number;
  txHash: string;
  createdAt: string;
  fulfillment: Fulfillment;
  shipTo: {
    name: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
  } | null;
}

export function VendorDashboard({ marketplaces, initialMarketplaceSlug = "", vendorAccount, products, sales: initialSales }: {
  marketplaces: SellerMarketplace[];
  initialMarketplaceSlug?: string;
  vendorAccount: string | null;
  products: ProductRow[];
  sales: SaleRow[];
}) {
  const locale = useLocale();

  const t = useTranslations("ui");

  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [marketplaceFilter, setMarketplaceFilter] = useState(initialMarketplaceSlug);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [tab, setTab] = useState<"products" | "sales">("products");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [sales, setSales] = useState(initialSales);
  const shownProducts = products.filter(p => !marketplaceFilter || p.marketplace.slug === marketplaceFilter);
  const shownSales = sales.filter(s => !marketplaceFilter || s.marketplace.slug === marketplaceFilter);
  const toShip = shownSales.filter(s => s.fulfillment.status === "PAID").length;
  const changeProduct = async (product: ProductRow, remove = false) => {
    if (actionBusy || refreshing) return;
    setActionBusy(product.id); setActionError(null);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}${remove ? "" : "/visibility"}`, {
        method: remove ? "DELETE" : "PATCH",
        ...(remove ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility: product.visibility === "PUBLISHED" ? "HIDDEN" : "PUBLISHED" }) }),
      });
      if (!response.ok) throw new Error();
      if (remove) setDeleting(null);
      startRefresh(() => router.refresh());
    } catch { setActionError(t("sellerProductActionFailed")); }
    finally { setActionBusy(null); }
  };

  return (
    <main id="main-content" tabIndex={-1} className={`mx-auto w-full max-w-6xl px-6 py-6 ${styles.studio}`}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <PageHeading eyebrow={t("madeByYouSharedWithYourCommunity")} title={t("yourSellerStudio")} description={t("sellerStudioDescription")} />
          <div className={styles.marketplacePicker}>
            <label htmlFor="seller-marketplace-filter">{t("sellerMarketplaceFilter")}</label>
            <select id="seller-marketplace-filter" value={marketplaceFilter} onChange={event => setMarketplaceFilter(event.target.value)}>
              <option value="">{t("allMarketplaces2")}</option>
              {marketplaces.map(marketplace => <option key={marketplace.slug} value={marketplace.slug}>{marketplace.name}</option>)}
            </select>
            {marketplaceFilter && <Link href={`/m/${marketplaceFilter}`} className="text-link">{t("viewMarketplace")}<Icon name="arrow" className="h-4 w-4" /></Link>}
          </div>
          <div className="dashboard-tabs">
            <TabButton active={tab === "products"} onClick={() => setTab("products")}>
              {t("myProducts")}</TabButton>
            <TabButton active={tab === "sales"} onClick={() => setTab("sales")}>
              {t("mySales")}
              {toShip > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-amber-800">
                  {t("toShipCount", { count: toShip })}
                </span>
              )}
            </TabButton>
          </div>
        </div>
        {vendorAccount && <div className="flex flex-col gap-2">
          <LiveBalance account={vendorAccount} label={t("yourDemoBalance")} accent />
          <button
            onClick={() => setWithdrawOpen(true)}
            className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {t("aboutWithdrawals")}</button>
        </div>}
      </div>

      {tab === "products" && (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-400">
              {t("productCount", { count: shownProducts.length })}
            </h2>
            <button
              disabled={marketplaces.length === 0}
              onClick={() => setEditing("new")}
              className="rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("addProduct")}</button>
          </div>

          {actionError && !deleting && <p role="alert" className={styles.error}>{actionError}</p>}
          {shownProducts.length === 0 ? (
            <div className={styles.empty}><Icon name="bag" className="h-7 w-7" /><p>{t("sellerEmptyCatalog")}</p>{marketplaces.length === 0 && <Link href="/marketplaces" className="text-link">{t("sellerJoinMarketplace")}</Link>}</div>
          ) : (
            <div className={styles.products}>
              {shownProducts.map(p => <article key={p.id} className={styles.product}>
<div className={styles.productMeta}><Link href={`/m/${p.marketplace.slug}`}><Icon name="store" className="h-3.5 w-3.5" />{p.marketplace.name}</Link><span className={p.visibility === "PUBLISHED" ? styles.published : styles.hidden}>{t(p.visibility === "PUBLISHED" ? "sellerProductPublished" : "sellerProductHidden")}</span></div>
                <ProductVisual imageUrl={p.imageUrl} />
                <div className={styles.productBody}>
                  <div className={styles.productTitle}><h3>{p.name}</h3><strong>{formatUsd(p.priceUsd, locale)}</strong></div>
                  <p className={styles.description}>{p.shortDescription || p.description}</p>
                  <p className={styles.stock}>{p.stock > 0 ? t("valueInStock", { value1: p.stock }) : t("outOfStock")}</p>
                  <div className={styles.productActions}>
                    <button type="button" onClick={() => setEditing(p)} disabled={Boolean(actionBusy) || refreshing}>{t("edit")}</button>
                    <button type="button" onClick={() => void changeProduct(p)} disabled={Boolean(actionBusy) || refreshing}>{actionBusy === p.id ? t("saving") : t(p.visibility === "PUBLISHED" ? "sellerHideProduct" : "sellerPublishProduct")}</button>
                    <button type="button" className={styles.delete} onClick={() => { setActionError(null); setDeleting(p); }} disabled={Boolean(actionBusy) || refreshing}><Icon name="trash" className="h-3.5 w-3.5" />{t("sellerDeleteProduct")}</button>
                  </div>
                </div>
              </article>)}
            </div>
          )}
        </section>
      )}

      {tab === "sales" && (
        <section className="mt-6">
          {shownSales.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              {t("noSalesYetWhenSomeoneBuysYourShareLandsHereWithin")}</div>
          ) : (
            <div className="scroll-table rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3 font-medium">{t("product")}</th>
                    <th className="px-4 py-3 font-medium">{t("when")}</th>
                    <th className="px-4 py-3 font-medium">{t("shipTo")}</th>
                    <th className="px-4 py-3 font-medium">{t("deliveryStatus")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("sale")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("youReceived")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shownSales.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50 align-top last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {s.quantity > 1 && <span className="tabular-nums text-slate-500">{s.quantity} × </span>}
                        {s.productName}<Link href={`/m/${s.marketplace.slug}`} className={styles.saleMarketplace}>{s.marketplace.name}</Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDateTime(s.createdAt, locale)}</td>
                      <td className="min-w-48 px-4 py-3 text-slate-600">
                        {s.shipTo ? (
                          <address className="not-italic leading-relaxed">
                            <span className="block font-medium text-slate-900">{s.shipTo.name}</span>
                            <span className="block">{s.shipTo.address}</span>
                            <span className="block">
                              {[s.shipTo.postalCode, s.shipTo.city].filter(Boolean).join(" ")}, {s.shipTo.country}
                            </span>
                          </address>
                        ) : (
                          <span className="text-xs text-slate-400">{t("noShippingAddress")}</span>
                        )}
                      </td>
                      <td className="min-w-44 px-4 py-3">
                        <FulfillmentBadge status={s.fulfillment.status} audience="vendor" />
                        <FulfillmentDetails fulfillment={s.fulfillment} />
                        <FulfillmentActions
                          saleId={s.id}
                          fulfillment={s.fulfillment}
                          onChange={(next) =>
                            setSales((rows) => rows.map((row) => (row.id === s.id ? { ...row, fulfillment: next } : row)))
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                        {formatUsd(s.amountUsd, locale)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-600">
                        +{formatUsd(s.vendorShareUsd, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {editing !== null && (
        <ProductModal
          marketplaceSlug={marketplaceFilter || marketplaces[0]?.slug}
          marketplaces={marketplaces}
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={setMarketplaceFilter}
        />
      )}
      {deleting && <Modal label={t("sellerDeleteProductTitle", { name: deleting.name })} onClose={() => { if (!actionBusy) setDeleting(null); }}>
        <h2 className="text-lg font-semibold">{t("sellerDeleteProductTitle", { name: deleting.name })}</h2>
        <p className={styles.deleteCopy}>{t("sellerDeleteProductDescription")}</p>
        {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
        <div className={styles.confirmActions}>
          <button type="button" className="button-secondary button-small" disabled={Boolean(actionBusy)} onClick={() => setDeleting(null)}>{t("cancel")}</button>
          <button type="button" className={styles.confirmDelete} disabled={Boolean(actionBusy)} onClick={() => void changeProduct(deleting, true)}>{t(actionBusy ? "sellerDeletingProduct" : "sellerDeleteProduct")}</button>
        </div>
      </Modal>}
      {withdrawOpen && <WithdrawModal onClose={() => setWithdrawOpen(false)} />}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function WithdrawModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("ui");

  return (
    <Modal onClose={onClose} label={t("aboutWithdrawals")}>
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t("withdrawYourBalance")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {t("withdrawalsWillLetSellersMoveEarningsOutOfCompakiThisFeature")}</p>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">{t("demoFundsCannotBeWithdrawn")}</p>
        <p className="mt-1">
          {t("thisDemoUsesATestAssetOnStellarTestnetYourDisplayed")}</p>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-full bg-navy-900 px-6 py-2 text-sm font-medium text-white hover:bg-navy-700"
        >
          {t("gotIt")}</button>
      </div>
    </Modal>
  );
}
