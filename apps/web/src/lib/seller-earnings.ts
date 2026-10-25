export interface SellerTerms {
  marketplace: { slug: string; name: string };
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
  platformBps: number;
  fundraisingStopped: boolean;
}

/** Matches saved cent prices and the contract's integer split at 7 decimals.
 * The community gets the remainder; when fundraising stops it goes to the seller.
 */
export function sellerEarnings(price: string, terms: SellerTerms) {
  const amount = Number(price);
  const shares = [terms.vendorBps, terms.operatorBps, terms.communityBps, terms.platformBps];
  if (!price.trim() || !Number.isFinite(amount) || amount < .01 || amount > 1_000_000 ||
      shares.some(bps => !Number.isInteger(bps) || bps < 0 || bps > 10_000) ||
      shares.reduce((total, bps) => total + bps, 0) !== 10_000) return null;
  const cents = Math.round(amount * 100);
  const units = BigInt(cents) * 100_000n;
  const portion = (bps: number) => units * BigInt(bps) / 10_000n;
  const operator = portion(terms.operatorBps);
  const platform = portion(terms.platformBps);
  let vendor = portion(terms.vendorBps);
  let community = units - vendor - operator - platform;
  if (terms.fundraisingStopped) { vendor += community; community = 0n; }
  return {
    priceUsd: cents / 100,
    vendorUsd: Number(vendor) / 10_000_000,
    operatorUsd: Number(operator) / 10_000_000,
    communityUsd: Number(community) / 10_000_000,
    platformUsd: Number(platform) / 10_000_000,
    vendorPercent: (terms.vendorBps + (terms.fundraisingStopped ? terms.communityBps : 0)) / 100,
  };
}
