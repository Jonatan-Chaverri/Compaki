export interface StorefrontProduct {
  id: string;
  name: string;
  shortDescription: string;
  priceUsd: number;
  stock: number;
  imageUrl: string | null;
  vendorId: string;
  vendorName: string;
}

export interface ProductFilters {
  query: string;
  minPrice: string;
  maxPrice: string;
  vendorIds: string[];
}

export function parsePriceRange(minPrice: string, maxPrice: string) {
  const min = minPrice.trim() === "" ? null : Number(minPrice);
  const max = maxPrice.trim() === "" ? null : Number(maxPrice);
  const invalid = [min, max].some(value => value !== null && (!Number.isFinite(value) || value < 0));
  const error = invalid ? "invalid" : min !== null && max !== null && min > max ? "reversed" : null;
  return { min, max, error };
}

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Names match without accents; filters combine, selected vendors are alternatives. */
export function filterStorefrontProducts(products: StorefrontProduct[], filters: ProductFilters) {
  const { min, max, error } = parsePriceRange(filters.minPrice, filters.maxPrice);
  if (error) return [];
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean);
  const vendors = new Set(filters.vendorIds);
  return products.filter(product => terms.every(term => normalize(product.name).includes(term))
    && (min === null || product.priceUsd >= min)
    && (max === null || product.priceUsd <= max)
    && (vendors.size === 0 || vendors.has(product.vendorId)));
}

export function storefrontVendors(products: StorefrontProduct[], locale: string) {
  const vendors = new Map<string, { id: string; name: string; count: number }>();
  for (const product of products) {
    const vendor = vendors.get(product.vendorId);
    if (vendor) vendor.count++;
    else vendors.set(product.vendorId, { id: product.vendorId, name: product.vendorName, count: 1 });
  }
  return [...vendors.values()].sort((a, b) => a.name.localeCompare(b.name, locale));
}
