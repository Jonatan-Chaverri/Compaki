"use client";
import { localizedMessage } from "@/i18n/errors";

import { useTranslations } from "next-intl";

// Shared product create/edit modal, used by the per-marketplace vendor
// dashboard and the cross-marketplace "My products" page. Creating needs the
// marketplaceSlug; editing PATCHes the product id.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { followSignatures, readResult } from "@/lib/wallet-signing";
import { useCompakiWallet } from "./cavos-provider";
import { Icon } from "./icon";
import { SellerEarnings } from "./seller-earnings";

export interface EditableProduct {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  priceUsd: number;
  stock: number;
  imageUrl: string | null;
  marketplace?: { name: string; slug: string };
}

const EMOJI_CHOICES = ["☕", "🍫", "🧺", "🏺", "🧶", "🎨", "🍯", "🌱", "🥖", "🧼", "📦", "🛠️"];

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 bg-white";

export function Modal({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label?: string }) {
  const t = useTranslations("ui");

  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return <dialog ref={dialog} aria-label={label ?? t("details")} className="app-dialog" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <button type="button" className="dialog-close" onClick={onClose} aria-label={t("closeDialog")}><Icon name="close" className="h-4 w-4" /></button>
    {children}
  </dialog>;
}

export function ProductModal({
  marketplaceSlug,
  marketplaces = [],
  product,
  onClose,
  onCreated,
}: {
  /** Required when creating; ignored on edit. */
  marketplaceSlug?: string;
  marketplaces?: { name: string; slug: string }[];
  product: EditableProduct | null;
  onClose: () => void;
  onCreated?: (marketplaceSlug: string) => void;
}) {
  const t = useTranslations("ui");

  const router = useRouter();
  const [selectedMarketplace, setSelectedMarketplace] = useState(product?.marketplace?.slug ?? marketplaceSlug ?? marketplaces[0]?.slug ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [shortDescription, setShortDescription] = useState(product?.shortDescription ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? String(product.priceUsd) : "");
  const [stock, setStock] = useState(product ? String(product.stock) : "");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Publishing in a marketplace for the first time may need the seller's
  // wallet to approve joining it on-chain.
  const wallet = useCompakiWallet();
  const [approving, setApproving] = useState(false);

  const valid =
    Boolean(product || selectedMarketplace) &&
    name.trim().length >= 2 &&
    Number(price) >= 0.01 &&
    Number.isInteger(Number(stock)) &&
    Number(stock) >= 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const first = await readResult(
        await fetch(product ? `/api/products/${product.id}` : "/api/products", {
          method: product ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketplaceSlug: selectedMarketplace,
            name,
            shortDescription,
            description,
            priceUsd: Number(price),
            stock: Number(stock),
            imageUrl,
          }),
        }),
      );
      const result = await followSignatures(first, wallet.signXdr, () => setApproving(true));
      setApproving(false);
      if (result.status !== 200 && result.status !== 201) {
        throw new Error(localizedMessage(result.body.error, t, t("couldNotSaveProduct")));
      }
      if (!product) onCreated?.(selectedMarketplace);
      onClose();
      router.refresh();
    } catch (err) {
      setApproving(false);
      setError(localizedMessage(err, t, t("couldNotSaveProduct")));
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} label={product ? t("editProduct") : t("addAProduct")}>
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">
        {product ? t("editProduct") : t("addAProduct")}
      </h2>
      <div className="mt-4 space-y-4">
        {!product && <div>
          <label htmlFor="product-marketplace" className="mb-1.5 block text-sm font-medium text-slate-700">{t("sellerPublishIn")}</label>
          <select id="product-marketplace" value={selectedMarketplace} onChange={event => setSelectedMarketplace(event.target.value)} className={inputClass} disabled={busy}>
            <option value="" disabled>{t("sellerChooseMarketplace")}</option>
            {marketplaces.map(marketplace => <option key={marketplace.slug} value={marketplace.slug}>{marketplace.name}</option>)}
          </select>
          <p className="mt-2 text-xs text-slate-500">{t("sellerMarketplaceOptionsHint")}</p>
        </div>}
        {product?.marketplace && <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">{t("sellerProductMarketplace", { name: product.marketplace.name })}</p>}
        <div>
          <label htmlFor="product-name" className="mb-1.5 block text-sm font-medium text-slate-700">{t("productName")}</label>
          <input
            type="text"
            id="product-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("handRoastedCoffee250g")}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="product-price" className="mb-1.5 block text-sm font-medium text-slate-700">{t("price2")}</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              id="product-price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="12.50"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="product-stock" className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("stock")}{" "}<span className="font-normal text-slate-400">{t("units")}</span>
            </label>
            <input
              type="number"
              min="0"
              step="1"
              id="product-stock"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="20"
              className={inputClass}
            />
          </div>
        </div>
        <SellerEarnings marketplaceSlug={selectedMarketplace} price={price} />
        <div>
          <label htmlFor="product-short" className="mb-1.5 block text-sm font-medium text-slate-700">
            {t("shortDescription")}{" "}
            <span className="font-normal text-slate-400">{t("shownOnTheStorefront")}</span>
          </label>
          <input
            type="text"
            id="product-short"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            maxLength={140}
            placeholder={t("oneLineThatSellsIt")}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="product-description" className="mb-1.5 block text-sm font-medium text-slate-700">
            {t("fullDescription")}{" "}
            <span className="font-normal text-slate-400">{t("shownOnTheProductPage")}</span>
          </label>
          <textarea
            id="product-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("whatMakesItSpecial")}
            rows={3}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="product-image" className="mb-1.5 block text-sm font-medium text-slate-700">
            {t("imageUrl")}{" "}<span className="font-normal text-slate-400">{t("orPickAnEmoji")}</span>
          </label>
          <input
            type="text"
            id="product-image"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder={t("imageUrlPlaceholder")}
            className={inputClass}
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setImageUrl(emoji)}
                aria-label={t("useValueAsProductImage", { value1: emoji })}
                aria-pressed={imageUrl === emoji}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition hover:bg-slate-100 ${
                  imageUrl === emoji ? "bg-slate-100 ring-2 ring-brand-600" : ""
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      {approving && <p className="mt-4 text-sm text-slate-600" role="status">{t("approveJoiningInYourWallet")}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{localizedMessage(error, t, error)}</p>}

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-full px-5 py-2 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          {t("cancel")}</button>
        <button
          onClick={() => void save()}
          disabled={!valid || busy}
          className="rounded-full bg-navy-900 px-6 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? t("saving") : t("saveProduct")}
        </button>
      </div>
    </Modal>
  );
}
