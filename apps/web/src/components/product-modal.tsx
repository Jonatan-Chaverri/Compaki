"use client";

// Shared product create/edit modal, used by the per-marketplace vendor
// dashboard and the cross-marketplace "My products" page. Creating needs the
// marketplaceSlug; editing PATCHes the product id.

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface EditableProduct {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  priceUsd: number;
  stock: number;
  imageUrl: string | null;
}

const EMOJI_CHOICES = ["☕", "🍫", "🧺", "🏺", "🧶", "🎨", "🍯", "🌱", "🥖", "🧼", "📦", "🛠️"];

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 bg-white";

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ProductModal({
  marketplaceSlug,
  product,
  onClose,
}: {
  /** Required when creating; ignored on edit. */
  marketplaceSlug?: string;
  product: EditableProduct | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(product?.name ?? "");
  const [shortDescription, setShortDescription] = useState(product?.shortDescription ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? String(product.priceUsd) : "");
  const [stock, setStock] = useState(product ? String(product.stock) : "");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    name.trim().length >= 2 &&
    Number(price) >= 0.01 &&
    Number.isInteger(Number(stock)) &&
    Number(stock) >= 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(product ? `/api/products/${product.id}` : "/api/products", {
        method: product ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplaceSlug,
          name,
          shortDescription,
          description,
          priceUsd: Number(price),
          stock: Number(stock),
          imageUrl,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save product");
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save product");
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">
        {product ? "Edit product" : "Add a product"}
      </h2>
      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hand-roasted coffee, 250g"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Short description{" "}
            <span className="font-normal text-slate-400">(shown on the storefront)</span>
          </label>
          <input
            type="text"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            maxLength={140}
            placeholder="One line that sells it"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Full description{" "}
            <span className="font-normal text-slate-400">(shown on the product page)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What makes it special?"
            rows={3}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Price ($)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="12.50"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Stock <span className="font-normal text-slate-400">(units)</span>
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="20"
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Image URL <span className="font-normal text-slate-400">or pick an emoji</span>
          </label>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://… or an emoji"
            className={inputClass}
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setImageUrl(emoji)}
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

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-full px-5 py-2 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          Cancel
        </button>
        <button
          onClick={() => void save()}
          disabled={!valid || busy}
          className="rounded-full bg-navy-900 px-6 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save product"}
        </button>
      </div>
    </Modal>
  );
}
