// Shared validation for product create/edit payloads.

export interface ProductInput {
  name: string;
  shortDescription: string;
  description: string;
  priceUsd: number;
  stock: number;
  imageUrl: string;
}

export function parseProductInput(body: unknown): ProductInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 2 || name.length > 80) return "Product name must be 2–80 characters";
  const shortDescription =
    typeof b.shortDescription === "string" ? b.shortDescription.trim().slice(0, 140) : "";
  const description =
    typeof b.description === "string" ? b.description.trim().slice(0, 2000) : "";
  const priceUsd = Number(b.priceUsd);
  if (!Number.isFinite(priceUsd) || priceUsd < 0.01 || priceUsd > 1_000_000) {
    return "Price must be between $0.01 and $1,000,000";
  }
  const stock = Number(b.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) {
    return "Stock must be a whole number between 0 and 1,000,000";
  }
  const imageUrl = typeof b.imageUrl === "string" ? b.imageUrl.trim().slice(0, 500) : "";
  return {
    name,
    shortDescription,
    description,
    priceUsd: Math.round(priceUsd * 100) / 100,
    stock,
    imageUrl,
  };
}
