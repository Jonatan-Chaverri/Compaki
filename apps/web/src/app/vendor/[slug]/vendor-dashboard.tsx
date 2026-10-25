"use client";
import { useLocale } from "next-intl";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/shell";
import { useState } from "react";

import { LiveBalance } from "@/components/live-balance";
import { Modal, ProductModal } from "@/components/product-modal";
import { ProductVisual } from "@/components/shell";
import { formatDateTime, formatUsd } from "@/lib/format";

export interface ProductRow {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  priceUsd: number;
  stock: number;
  imageUrl: string | null;
}

export interface SaleRow {
  id: string;
  productName: string;
  quantity: number;
  amountUsd: number;
  vendorShareUsd: number;
  txHash: string;
  createdAt: string;
  shipTo: {
    name: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
  } | null;
}

export function VendorDashboard({
  slug,
  marketplaceName,
  vendorAccount,
  vendorBps,
  products,
  sales,
}: {
  slug: string;
  marketplaceName: string;
  vendorAccount: string;
  vendorBps: number;
  products: ProductRow[];
  sales: SaleRow[];
}) {
  const locale = useLocale();

  const t = useTranslations("ui");

  const [tab, setTab] = useState<"products" | "sales">("products");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <PageHeading eyebrow={t("madeByYouSharedWithYourCommunity")} title={t("yourSellerStudio")} description={t("yourProductsAndSalesOnValueYouKeepValueOfEvery", { value1: marketplaceName, value2: vendorBps / 100 })} />
          <Link href={`/m/${slug}`} className="text-link mb-5">{t("viewMarketplace")}<Icon name="arrow" className="h-4 w-4" /></Link>
          <div className="dashboard-tabs">
            <TabButton active={tab === "products"} onClick={() => setTab("products")}>
              {t("myProducts")}</TabButton>
            <TabButton active={tab === "sales"} onClick={() => setTab("sales")}>
              {t("mySales")}</TabButton>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <LiveBalance account={vendorAccount} label={t("yourDemoBalance")} accent />
          <button
            onClick={() => setWithdrawOpen(true)}
            className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {t("aboutWithdrawals")}</button>
        </div>
      </div>

      {tab === "products" && (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-400">
              {t("productCount", { count: products.length })}
            </h2>
            <button
              onClick={() => setEditing("new")}
              className="rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-700"
            >
              {t("addProduct")}</button>
          </div>

          {products.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              {t("noProductsYetAddYourFirstOneAndItAppearsIn")}</div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {products.map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <ProductVisual imageUrl={p.imageUrl} />
                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatUsd(p.priceUsd, locale)}
                    </p>
                  </div>
                  <p className="mt-1 line-clamp-2 min-h-8 text-xs text-slate-500">
                    {p.shortDescription || p.description}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      onClick={() => setEditing(p)}
                      className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
                    >
                      {t("edit")}</button>
                    <span
                      className={`text-xs font-medium ${
                        p.stock > 0 ? "text-slate-500" : "text-red-600"
                      }`}
                    >
                      {p.stock > 0 ? t("valueInStock", { value1: p.stock }) : t("outOfStock")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "sales" && (
        <section className="mt-6">
          {sales.length === 0 ? (
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
                    <th className="px-4 py-3 text-right font-medium">{t("sale")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("youReceived")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50 align-top last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {s.quantity > 1 && <span className="tabular-nums text-slate-500">{s.quantity} × </span>}
                        {s.productName}
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
          marketplaceSlug={slug}
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
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
