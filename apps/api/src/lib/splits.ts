// Off-chain mirror of the contract's payment split (purchase in
// contracts/marketplace/src/lib.rs), used to record each sale's breakdown.
//
//   - Compaki's platform fee: a fixed 2% of every sale.
//   - The marketplace's vendor / operator / community shares cover the other
//     98% (they must add up to 9_800 bps).
//   - Vendor, operator and platform amounts round down; the community share
//     takes the remainder, so no stroop is ever lost.

import type { SplitSnapshot } from "@/lib/db";
import { stroopsToUsd } from "@/lib/stellar";

export const BPS_DENOM = 10_000;
export const PLATFORM_FEE_BPS = 200;
export const MARKETPLACE_SHARE_BPS = BPS_DENOM - PLATFORM_FEE_BPS;

export interface MarketplaceSplit {
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
}

/** Builds the frozen per-sale snapshot for a purchase of `amountStroops`. */
export function splitSnapshot(
  amountStroops: bigint,
  split: MarketplaceSplit,
  rewardsPeriodId: number | null,
): SplitSnapshot {
  const share = (bps: number) => (amountStroops * BigInt(bps)) / BigInt(BPS_DENOM);
  const vendor = share(split.vendorBps);
  const operator = share(split.operatorBps);
  const platform = share(PLATFORM_FEE_BPS);
  const community = amountStroops - vendor - operator - platform;
  return {
    vendorBps: split.vendorBps,
    operatorBps: split.operatorBps,
    communityBps: split.communityBps,
    platformBps: PLATFORM_FEE_BPS,
    vendorAmountUsd: stroopsToUsd(vendor),
    operatorAmountUsd: stroopsToUsd(operator),
    communityAmountUsd: stroopsToUsd(community),
    platformAmountUsd: stroopsToUsd(platform),
    rewardsPeriodId,
  };
}
