// /api/rewards — Community Rewards and fundraising.
//
//   GET  /marketplace/:slug                    rules, periods / fundraising progress (public)
//   POST /marketplace/:slug/periods/:id/claim  claim the session user's reward for an ended period
//                                              (own wallets: 202 + tx to sign,
//                                              finished by POST /api/tx/:id)
//   POST /marketplace/:slug/fundraise/release  release a round that reached its target (any signed-in user)
//   POST /marketplace/:slug/guarantees         simulate a forbidden action (operator)
//   GET  /me                                   session user's rewards across marketplaces
//
// Every balance, rule and claim right in these payloads is read from the
// contract (see src/lib/rewards.ts and src/lib/fundraise.ts). Postgres adds
// who took part, names and tx hashes. Participants with their own wallet sign
// their claims in the browser; for custodial accounts the backend signs with
// the key it holds, so there `require_auth` proves "the backend acted for
// this user" (README "Custody").

import { Hono } from "hono";

import { parseSplitSnapshot, prisma } from "@/lib/db";
import { loadFundraiseView, releaseIfReached } from "@/lib/fundraise";
import { createPending, signatureRequest, type PendingTx } from "@/lib/pending-tx";
import {
  boundOnChainId,
  communityModeOf,
  describeContractError,
  loadRewardsView,
  PERIOD_HISTORY_LIMIT,
} from "@/lib/rewards";
import { getSessionUser } from "@/lib/session";
import { personalWallet, userAddresses } from "@/lib/wallets";
import {
  claimReward,
  decryptSecret,
  getFundraise,
  getReward,
  getRewardsStatus,
  i128Of,
  prepareClaim,
  simulateForbiddenAction,
  stellarConfig,
  stellarExpertTxUrl,
  stroopsToUsd,
  usdToStroops,
} from "@/lib/stellar";

export const rewards = new Hono();

const marketplaceSelect = {
  id: true,
  name: true,
  slug: true,
  operatorId: true,
  communityMode: true,
  splitCommunityBps: true,
  rewardsPeriodSeconds: true,
  rewardsVendorPoolBps: true,
  communityGoalUsd: true,
  fundraisePolicy: true,
  fundraiseRecipients: true,
  contractMarketplaceId: true,
  contractId: true,
} as const;

/** The address the viewer's money uses (own wallet once ready, else custodial). */
function viewerAddressOf(user: Parameters<typeof personalWallet>[0]): string | null {
  const personal = personalWallet(user);
  return personal.kind === "none" ? null : personal.address;
}

function errorResponse(error: unknown, fallback: string) {
  const known = describeContractError(error);
  if (known) return { body: { error: known.message, code: known.code }, status: known.status };
  console.error(`[rewards] ${fallback}:`, error);
  return { body: { error: fallback }, status: 500 as const };
}

// ── GET /marketplace/:slug ─────────────────────────────────────────────────

rewards.get("/marketplace/:slug", async (c) => {
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug: c.req.param("slug") },
    select: marketplaceSelect,
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);

  const user = await getSessionUser(c);
  const mode = communityModeOf(marketplace);
  try {
    return c.json({
      marketplace: { name: marketplace.name, slug: marketplace.slug },
      mode,
      canManage: user?.id === marketplace.operatorId,
      viewerAddress: user ? viewerAddressOf(user) : null,
      rewards: mode === "rewards" ? await loadRewardsView(marketplace) : null,
      fundraise: mode === "fundraise" ? await loadFundraiseView(marketplace) : null,
    });
  } catch (error) {
    const { body, status } = errorResponse(error, "Could not read the community fund from the contract");
    return c.json(body, status);
  }
});

// ── POST /marketplace/:slug/periods/:id/claim ──────────────────────────────
//
// Claims for the session user only: the contract pays the address whose
// authorization it checks. The user may have taken part with their own
// wallet and/or a custodial account; the first one with an unclaimed reward
// is used. An own wallet signs in the browser (202 + the transaction; POST
// /api/tx/:id submits it and calls completeClaim); a custodial account is
// signed by the backend.

/** Auxiliary record for the explorer link; the claim is already final on-chain. */
async function recordClaim(params: {
  marketplaceId: string;
  periodId: number;
  memberAddress: string;
  amountUsd: number;
  txHash: string;
}) {
  try {
    await prisma.rewardClaim.create({
      data: { ...params, contractId: stellarConfig.marketplaceContractId },
    });
  } catch (dbError) {
    console.error("[rewards] claim confirmed on-chain but not recorded:", params.txHash, dbError);
  }
}

interface ClaimContext {
  marketplaceId: string;
  periodId: number;
}

rewards.post("/marketplace/:slug/periods/:id/claim", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in to claim" }, 401);
  const periodId = Number(c.req.param("id"));
  if (!Number.isInteger(periodId) || periodId < 0) return c.json({ error: "Invalid period" }, 400);

  const marketplace = await prisma.marketplace.findUnique({
    where: { slug: c.req.param("slug") },
    select: marketplaceSelect,
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  const onChainId = boundOnChainId(marketplace);
  if (communityModeOf(marketplace) !== "rewards" || onChainId === null) {
    return c.json({ error: "Community Rewards is not enabled for this marketplace" }, 400);
  }

  try {
    let ended = true;
    let claimable: string | null = null;
    for (const address of userAddresses(user)) {
      const reward = await getReward(onChainId, periodId, address);
      ended = reward.periodEnded;
      if (reward.amountStroops > 0n && !reward.claimed) {
        claimable = address;
        break;
      }
    }
    if (!ended) {
      return c.json({ error: "This period hasn't ended yet; rewards can be claimed after it ends.", code: "PeriodNotEnded" }, 409);
    }
    if (!claimable) {
      return c.json({ error: "You have no unclaimed reward in this period.", code: "NothingToClaim" }, 409);
    }

    // Their own wallet took part: they sign the claim themselves.
    if (claimable === user.walletAddress) {
      if (!user.walletReadyAt) {
        return c.json({ error: "Finish setting up your wallet first", code: "WALLET_SETUP" }, 409);
      }
      const prepared = await prepareClaim({
        memberPublicKey: user.walletAddress,
        marketplaceId: onChainId,
        periodId,
      });
      const pending = createPending<ClaimContext>({
        kind: "claim",
        userId: user.id,
        signer: user.walletAddress,
        xdr: prepared.xdr,
        hash: prepared.hash,
        context: { marketplaceId: marketplace.id, periodId },
      });
      return c.json(signatureRequest(pending, `Claim your period #${periodId + 1} reward`), 202);
    }

    // Custodial account: the backend signs with the key it holds.
    if (claimable !== user.stellarPublicKey || !user.stellarSecretEncrypted) {
      return c.json({ error: "This reward belongs to an account you can't sign for here." }, 403);
    }
    const { amountStroops, txHash } = await claimReward({
      memberSecret: decryptSecret(user.stellarSecretEncrypted),
      marketplaceId: onChainId,
      periodId,
    });
    const amountUsd = stroopsToUsd(amountStroops);
    await recordClaim({
      marketplaceId: marketplace.id,
      periodId,
      memberAddress: claimable,
      amountUsd,
      txHash,
    });
    return c.json({ periodId, amountUsd, txHash, verifyUrl: stellarExpertTxUrl(txHash) });
  } catch (error) {
    const { body, status } = errorResponse(error, "Could not claim the reward");
    return c.json(body, status);
  }
});

/** Called by POST /api/tx/:id once a wallet-signed claim confirmed on-chain. */
export async function completeClaim(
  pending: PendingTx,
  result: { txHash: string; returnValue: Parameters<typeof i128Of>[0] },
) {
  const context = pending.context as ClaimContext;
  const amountUsd = stroopsToUsd(i128Of(result.returnValue));
  await recordClaim({
    marketplaceId: context.marketplaceId,
    periodId: context.periodId,
    memberAddress: pending.signer,
    amountUsd,
    txHash: result.txHash,
  });
  return { periodId: context.periodId, amountUsd, verifyUrl: stellarExpertTxUrl(result.txHash) };
}

// ── POST /marketplace/:slug/fundraise/release ──────────────────────────────
//
// Normally the API releases a round right after the sale that reached the
// target; this is the manual fallback. The contract lets anyone release, so
// any signed-in user may press the button.

rewards.post("/marketplace/:slug/fundraise/release", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in first" }, 401);
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug: c.req.param("slug") },
    select: marketplaceSelect,
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  if (communityModeOf(marketplace) !== "fundraise" || boundOnChainId(marketplace) === null) {
    return c.json({ error: "This marketplace has no fundraising target" }, 400);
  }
  try {
    const released = await releaseIfReached(marketplace);
    if (!released) {
      return c.json({ error: "The fundraising target hasn't been reached yet.", code: "GoalNotReached" }, 409);
    }
    return c.json({ ...released, verifyUrl: stellarExpertTxUrl(released.txHash) });
  } catch (error) {
    const { body, status } = errorResponse(error, "Could not release the funds");
    return c.json(body, status);
  }
});

// ── POST /marketplace/:slug/guarantees — "try to break it" demo ───────────
//
// Body: { kind: "claim-for-someone" | "withdraw" }. Evaluates the forbidden
// action with the operator's identity against the live contract (simulation
// with enforced auth — exactly what the network would execute) and reports
// the rejection. Nothing is submitted.

rewards.post("/marketplace/:slug/guarantees", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in as the operator" }, 401);
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug: c.req.param("slug") },
    select: { ...marketplaceSelect, operator: { select: { stellarPublicKey: true } } },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  if (marketplace.operatorId !== user.id) {
    return c.json({ error: "Only the marketplace operator can run these checks" }, 403);
  }
  const mode = communityModeOf(marketplace);
  const onChainId = boundOnChainId(marketplace);
  if (mode === "classic" || onChainId === null || !marketplace.operator.stellarPublicKey) {
    return c.json({ error: "This marketplace has no protected community fund" }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const kind = (body as Record<string, unknown> | null)?.kind;
  if (kind !== "claim-for-someone" && kind !== "withdraw") {
    return c.json({ error: "Unknown check" }, 400);
  }
  if (kind === "claim-for-someone" && mode !== "rewards") {
    return c.json({ kind, applicable: false, message: "Only rewards marketplaces have claims." });
  }

  try {
    let held: bigint;
    let participant: string | undefined;
    let periodId: number | undefined;
    if (mode === "rewards") {
      const status = await getRewardsStatus(onChainId);
      held = status.totalContributedStroops - status.totalClaimedStroops;
      // Try a real participant of the latest ended period when there is one.
      periodId = Math.max(0, status.currentPeriod - 1);
      const sale = await prisma.sale.findFirst({
        where: { product: { marketplaceId: marketplace.id } },
        orderBy: { createdAt: "desc" },
        select: { splitSnapshot: true },
      });
      participant = sale ? parseSplitSnapshot(sale.splitSnapshot).buyerAddress : undefined;
    } else {
      held = (await getFundraise(onChainId)).raisedStroops;
    }
    const result = await simulateForbiddenAction({
      kind,
      operatorPublicKey: marketplace.operator.stellarPublicKey,
      marketplaceId: onChainId,
      amountStroops: held > 0n ? held : usdToStroops(1),
      participant,
      periodId,
    });
    return c.json({ kind, applicable: true, ...result });
  } catch (error) {
    const { body: errBody, status } = errorResponse(error, "Check could not be evaluated");
    return c.json(errBody, status);
  }
});

// ── GET /me — the session user's rewards ───────────────────────────────────
//
// Finds the rewards periods the user took part in from their recorded sales
// and purchases, then reads each reward from the contract.

rewards.get("/me", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const mine = userAddresses(user);
  if (mine.length === 0) return c.json({ address: null, marketplaces: [] });
  const address = viewerAddressOf(user);

  const sales = await prisma.sale.findMany({
    where: {
      OR: [{ buyerId: user.id }, { product: { vendorId: user.id } }],
      product: {
        marketplace: {
          communityMode: "rewards",
          contractId: stellarConfig.marketplaceContractId,
          contractMarketplaceId: { not: null },
        },
      },
    },
    select: {
      amountUsd: true,
      splitSnapshot: true,
      product: { select: { marketplace: { select: marketplaceSelect } } },
    },
    orderBy: { createdAt: "desc" },
    take: 1_000,
  });

  // (marketplace, period) → which of the user's addresses took part, and how.
  type Entry = { sold: number; bought: number; addresses: Set<string> };
  const byMarketplace = new Map<string, { marketplace: (typeof sales)[number]["product"]["marketplace"]; periods: Map<number, Entry> }>();
  for (const sale of sales) {
    let snapshot;
    try {
      snapshot = parseSplitSnapshot(sale.splitSnapshot);
    } catch {
      continue;
    }
    const k = snapshot.rewardsPeriodId;
    if (k === undefined || k === null) continue;
    const m = sale.product.marketplace;
    const group = byMarketplace.get(m.id) ?? { marketplace: m, periods: new Map<number, Entry>() };
    const entry = group.periods.get(k) ?? { sold: 0, bought: 0, addresses: new Set<string>() };
    if (snapshot.vendorAddress && mine.includes(snapshot.vendorAddress)) {
      entry.sold += sale.amountUsd;
      entry.addresses.add(snapshot.vendorAddress);
    }
    if (snapshot.buyerAddress && mine.includes(snapshot.buyerAddress)) {
      entry.bought += sale.amountUsd;
      entry.addresses.add(snapshot.buyerAddress);
    }
    if (entry.addresses.size > 0) group.periods.set(k, entry);
    byMarketplace.set(m.id, group);
  }

  try {
    const marketplaces = await Promise.all(
      [...byMarketplace.values()]
        .filter((g) => g.periods.size > 0)
        .map(async ({ marketplace, periods }) => {
          const onChainId = BigInt(marketplace.contractMarketplaceId as string);
          const [status, claims] = await Promise.all([
            getRewardsStatus(onChainId),
            prisma.rewardClaim.findMany({
              where: { marketplaceId: marketplace.id, contractId: stellarConfig.marketplaceContractId },
            }),
          ]);
          const ids = [...periods.keys()].sort((a, b) => b - a).slice(0, PERIOD_HISTORY_LIMIT);
          const rows = await Promise.all(
            ids.map(async (k) => {
              const entry = periods.get(k) as Entry;
              const rewards = await Promise.all(
                [...entry.addresses].map(async (a) => ({ address: a, reward: await getReward(onChainId, k, a) })),
              );
              const amount = rewards.reduce((sum, r) => sum + r.reward.amountStroops, 0n);
              const unclaimed = rewards.some((r) => r.reward.amountStroops > 0n && !r.reward.claimed);
              const startTs = status.startTs + k * status.periodSeconds;
              const claimTx = claims.find((cl) => cl.periodId === k && entry.addresses.has(cl.memberAddress));
              return {
                periodId: k,
                startTs,
                endTs: startTs + status.periodSeconds,
                status: k < status.currentPeriod ? "ended" : "current",
                soldUsd: Math.round(entry.sold * 100) / 100,
                boughtUsd: Math.round(entry.bought * 100) / 100,
                amountUsd: stroopsToUsd(amount),
                claimed: amount > 0n && !unclaimed,
                claimTxHash: claimTx?.txHash ?? null,
              };
            }),
          );
          return {
            name: marketplace.name,
            slug: marketplace.slug,
            ledgerTime: status.ledgerTime,
            vendorPoolBps: status.vendorPoolBps,
            buyerPoolBps: status.buyerPoolBps,
            periods: rows,
          };
        }),
    );
    return c.json({ address, historyLimit: PERIOD_HISTORY_LIMIT, marketplaces });
  } catch (error) {
    const { body, status } = errorResponse(error, "Could not read rewards from the contract");
    return c.json(body, status);
  }
});
