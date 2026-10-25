// Payment split constants shared with the contract (purchase in
// contracts/marketplace/src/lib.rs), and the per-sale breakdown recorded
// from what the contract actually paid.
//
//   - Compaki's platform fee: a fixed 2% of every sale.
//   - The marketplace's vendor / operator / community shares cover the other
//     98% (they must add up to 9_800 bps).
//   - Vendor, operator and platform amounts round down; the community share
//     takes the remainder, so no stroop is ever lost.

import type { SplitSnapshot } from "@/lib/db";
import { stroopsToUsd, type PurchaseReceipt } from "@/lib/stellar";

export const BPS_DENOM = 10_000;
export const PLATFORM_FEE_BPS = 200;
export const MARKETPLACE_SHARE_BPS = BPS_DENOM - PLATFORM_FEE_BPS;

export interface MarketplaceSplit {
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
}

/** Builds the frozen per-sale snapshot from a confirmed purchase's receipt. */
export function splitSnapshot(
  split: MarketplaceSplit,
  receipt: PurchaseReceipt,
  parties: { buyerAddress: string; vendorAddress: string },
): SplitSnapshot {
  return {
    vendorBps: split.vendorBps,
    operatorBps: split.operatorBps,
    communityBps: split.communityBps,
    platformBps: PLATFORM_FEE_BPS,
    vendorAmountUsd: stroopsToUsd(receipt.vendorStroops),
    operatorAmountUsd: stroopsToUsd(receipt.operatorStroops),
    communityAmountUsd: stroopsToUsd(receipt.communityStroops),
    platformAmountUsd: stroopsToUsd(receipt.platformStroops),
    rewardsPeriodId: receipt.period,
    fundraiseRound: receipt.round,
    buyerAddress: parties.buyerAddress,
    vendorAddress: parties.vendorAddress,
  };
}
