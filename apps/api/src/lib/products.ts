// Shared validation for product create/edit payloads.

export interface ProductInput {
  name: string;
  description: string;
  priceUsd: number;
  imageUrl: string;
}

export function parseProductInput(body: unknown): ProductInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 2 || name.length > 80) return "Product name must be 2–80 characters";
  const description =
    typeof b.description === "string" ? b.description.trim().slice(0, 500) : "";
  const priceUsd = Number(b.priceUsd);
  if (!Number.isFinite(priceUsd) || priceUsd < 0.01 || priceUsd > 1_000_000) {
    return "Price must be between $0.01 and $1,000,000";
  }
  const imageUrl = typeof b.imageUrl === "string" ? b.imageUrl.trim().slice(0, 500) : "";
  return { name, description, priceUsd: Math.round(priceUsd * 100) / 100, imageUrl };
}
