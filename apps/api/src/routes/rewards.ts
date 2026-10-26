// /api/rewards — Community Rewards and fundraising.
//
//   GET  /marketplace/:slug                    rules, periods / fundraising progress (public)
//   POST /marketplace/:slug/periods/:id/claim  claim the session user's reward for a distributed period
//                                              (own wallets: 202 + tx to sign,
//                                              finished by POST /api/tx/:id)
//   PUT  /marketplace/:slug/next-rules         schedule or clear the next period's rules on-chain
//                                              (operator; own wallets: 202 + tx to sign)
//   POST /marketplace/:slug/distribute         distribute a due period now (any signed-in user;
//                                              the scheduler normally does it on time)
//   PUT  /marketplace/:slug/fundraise/next-target  schedule or clear the next round's target
//                                              on-chain (operator; own wallets: 202 + tx to sign)
//   POST /marketplace/:slug/fundraise/release  release a round that reached its target (any signed-in user)
//   POST /marketplace/:slug/guarantees         simulate a forbidden action (operator)
//   GET  /me                                   session user's rewards across marketplaces
//
// Every balance, rule and claim right in these payloads is read from the
// contract (see src/lib/rewards.ts and src/lib/fundraise.ts). Postgres adds
// who took part, names and tx hashes. Participants sign their claims in the
// browser with their own wallet.

import { Hono } from "hono";

import { parseSplitSnapshot, prisma } from "@/lib/db";
import { distributeIfDue, loadDistributable } from "@/lib/distribution";
import { loadFundraiseView, releaseIfReachedById } from "@/lib/fundraise";
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
  getFundraise,
  getPeriodTotals,
  getReward,
  getRewardsStatus,
  claimedAmountOf,
  prepareCall,
  prepareClaim,
  setNextRulesCall,
  setNextTargetCall,
  type ContractCall,
  simulateForbiddenAction,
  stellarConfig,
  stellarExpertTxUrl,
  isTestnet,
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
  rewardsNextVendorPoolBps: true,
  rewardsNextPeriodSeconds: true,
  communityGoalUsd: true,
  fundraisePolicy: true,
  fundraiseRecipients: true,
  fundraiseNextTargetUsd: true,
  contractMarketplaceId: true,
  contractId: true,
} as const;

/** The address the viewer's money uses (their wallet, once ready). */
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
// authorization it checks. The user's wallet signs in the browser (202 + the
// transaction; POST /api/tx/:id submits it and calls completeClaim).

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
      return c.json({ error: "This period hasn't been distributed yet; rewards can be claimed after the distribution.", code: "PeriodNotEnded" }, 409);
    }
    if (!claimable) {
      return c.json({ error: "You have no unclaimed reward in this period.", code: "NothingToClaim" }, 409);
    }

    // The user signs the claim with their own wallet.
    if (!user.walletReadyAt) {
      return c.json({ error: "Finish setting up your wallet first", code: "WALLET_SETUP" }, 409);
    }
    const prepared = await prepareClaim({
      memberPublicKey: claimable,
      marketplaceId: onChainId,
      periodId,
    });
    const pending = createPending<ClaimContext>({
      kind: "claim",
      userId: user.id,
      signer: claimable,
      xdr: prepared.xdr,
      hash: prepared.hash,
      context: { marketplaceId: marketplace.id, periodId },
    });
    return c.json(signatureRequest(pending, `Claim your period #${periodId + 1} reward`), 202);
  } catch (error) {
    const { body, status } = errorResponse(error, "Could not claim the reward");
    return c.json(body, status);
  }
});

/** Called by POST /api/tx/:id once a wallet-signed claim confirmed on-chain. */
export async function completeClaim(
  pending: PendingTx,
  result: { txHash: string; returnValue: Parameters<typeof claimedAmountOf>[0] },
) {
  const context = pending.context as ClaimContext;
  const amountUsd = stroopsToUsd(claimedAmountOf(result.returnValue));
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
    const released = await releaseIfReachedById(marketplace.id);
    if (!released) {
      return c.json({ error: "The fundraising target hasn't been reached yet.", code: "GoalNotReached" }, 409);
    }
    return c.json({ ...released, verifyUrl: stellarExpertTxUrl(released.txHash) });
  } catch (error) {
    const { body, status } = errorResponse(error, "Could not release the funds");
    return c.json(body, status);
  }
});

// ── Next period's rules / next round's target (operator) ───────────────────
//
// Scheduled on-chain (set_next_rules / set_next_target, operator-signed) and
// applied by the next distribution / release, which then needs no signature.
// The operator's wallet signs in the browser (202 + transaction, finished by
// POST /api/tx/:id). Postgres mirrors the confirmed choice for display. They never touch the
// running period or round; null clears them.

const DAY = 24 * 60 * 60;
/** Lengths offered for a period (monthly … yearly; 10 minutes on testnet for demos). */
function allowedPeriods(): number[] {
  const periods = [30 * DAY, 90 * DAY, 180 * DAY, 365 * DAY];
  return isTestnet() ? [10 * 60, ...periods] : periods;
}

async function operatorMarketplace(c: Parameters<typeof getSessionUser>[0], slug: string) {
  const user = await getSessionUser(c);
  if (!user) return { error: c.json({ error: "Sign in as the operator" }, 401) };
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug },
    select: { ...marketplaceSelect, operatorAddress: true },
  });
  if (!marketplace) return { error: c.json({ error: "Marketplace not found" }, 404) };
  if (marketplace.operatorId !== user.id) {
    return { error: c.json({ error: "Only the marketplace operator can change this" }, 403) };
  }
  const onChainId = boundOnChainId(marketplace);
  const operatorAddress = marketplace.operatorAddress;
  if (onChainId === null || !operatorAddress) {
    return { error: c.json({ error: "This marketplace is not ready for purchases yet" }, 409) };
  }
  // The browser can only sign with the wallet the session belongs to.
  if (operatorAddress !== user.walletAddress) {
    return { error: c.json({ error: "Sign in with the wallet that created this marketplace" }, 409) };
  }
  return { user, marketplace, onChainId, operatorAddress };
}

/** Prepares an operator call as a 202 + transaction for the operator's wallet to sign. */
async function signAsOperator<C>(
  found: { user: { id: string }; operatorAddress: string },
  call: ContractCall,
  pendingKind: "next-rules" | "next-target",
  context: C,
  label: string,
) {
  const prepared = await prepareCall(call, found.operatorAddress);
  const pending = createPending<C>({
    kind: pendingKind,
    userId: found.user.id,
    signer: found.operatorAddress,
    xdr: prepared.xdr,
    hash: prepared.hash,
    context,
  });
  return signatureRequest(pending, label);
}

interface NextRulesContext {
  marketplaceId: string;
  rules: { vendorPoolBps: number; periodSeconds: number } | null;
}

async function saveNextRules({ marketplaceId, rules }: NextRulesContext) {
  await prisma.marketplace.update({
    where: { id: marketplaceId },
    data: { rewardsNextVendorPoolBps: rules?.vendorPoolBps ?? null, rewardsNextPeriodSeconds: rules?.periodSeconds ?? null },
  });
  return { nextRules: rules };
}

/** Called by POST /api/tx/:id once the operator's wallet signed set_next_rules. */
export function completeNextRules(pending: PendingTx) {
  return saveNextRules(pending.context as NextRulesContext);
}

interface NextTargetContext {
  marketplaceId: string;
  targetUsd: number | null;
}

async function saveNextTarget({ marketplaceId, targetUsd }: NextTargetContext) {
  await prisma.marketplace.update({ where: { id: marketplaceId }, data: { fundraiseNextTargetUsd: targetUsd } });
  return { nextTargetUsd: targetUsd };
}

/** Called by POST /api/tx/:id once the operator's wallet signed set_next_target. */
export function completeNextTarget(pending: PendingTx) {
  return saveNextTarget(pending.context as NextTargetContext);
}

async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

rewards.put("/marketplace/:slug/next-rules", async (c) => {
  const found = await operatorMarketplace(c, c.req.param("slug"));
  if (found.error) return found.error;
  const { marketplace } = found;
  if (communityModeOf(marketplace) !== "rewards") {
    return c.json({ error: "Community Rewards is not enabled for this marketplace" }, 400);
  }
  const body = await readBody(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  let rules: NextRulesContext["rules"] = null;
  if (body.clear !== true) {
    const vendorPoolBps = Number(body.vendorPoolBps);
    const periodSeconds = Number(body.periodSeconds);
    if (!Number.isInteger(vendorPoolBps) || vendorPoolBps < 0 || vendorPoolBps > 10_000) {
      return c.json({ error: "The sellers' and buyers' parts of the rewards must add up to 100%" }, 400);
    }
    if (!allowedPeriods().includes(periodSeconds)) {
      return c.json({ error: "Choose how often rewards are shared" }, 400);
    }
    rules = { vendorPoolBps, periodSeconds };
  }
  try {
    const call = setNextRulesCall({
      marketplaceId: found.onChainId,
      rules: rules && { ...rules, buyerPoolBps: 10_000 - rules.vendorPoolBps },
    });
    const result = await signAsOperator(
      found,
      call,
      "next-rules",
      { marketplaceId: marketplace.id, rules },
      "Schedule the next period's rules",
    );
    return c.json(result, 202);
  } catch (error) {
    const { body: errBody, status } = errorResponse(error, "Could not save the next period's rules");
    return c.json(errBody, status);
  }
});

rewards.post("/marketplace/:slug/distribute", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in first" }, 401);
  const marketplace = await loadDistributable({ slug: c.req.param("slug") });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  try {
    const done = await distributeIfDue(marketplace);
    if (!done) {
      return c.json({ error: "This period hasn't reached its end yet.", code: "PeriodNotEnded" }, 409);
    }
    return c.json({ ...done, verifyUrl: stellarExpertTxUrl(done.txHash) });
  } catch (error) {
    const { body, status } = errorResponse(error, "Could not distribute the rewards");
    return c.json(body, status);
  }
});

rewards.put("/marketplace/:slug/fundraise/next-target", async (c) => {
  const found = await operatorMarketplace(c, c.req.param("slug"));
  if (found.error) return found.error;
  const { marketplace } = found;
  if (communityModeOf(marketplace) !== "fundraise") {
    return c.json({ error: "This marketplace has no fundraising target" }, 400);
  }
  const body = await readBody(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  const raw = body.targetUsd;
  const target = raw === null ? null : Number(raw);
  if (
    target !== null &&
    (!Number.isFinite(target) || target < 0 || target > 1_000_000_000 || Math.abs(target * 100 - Math.round(target * 100)) > 0.00001)
  ) {
    return c.json({ error: "The next target must be 0 (stop) or a positive amount with up to two decimals" }, 400);
  }
  try {
    const call = setNextTargetCall({
      marketplaceId: found.onChainId,
      targetStroops: target === null ? null : usdToStroops(target),
    });
    const result = await signAsOperator(
      found,
      call,
      "next-target",
      { marketplaceId: marketplace.id, targetUsd: target },
      "Schedule the next round's target",
    );
    return c.json(result, 202);
  } catch (error) {
    const { body: errBody, status } = errorResponse(error, "Could not save the next round's target");
    return c.json(errBody, status);
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
    select: { ...marketplaceSelect, operatorAddress: true },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  if (marketplace.operatorId !== user.id) {
    return c.json({ error: "Only the marketplace operator can run these checks" }, 403);
  }
  const mode = communityModeOf(marketplace);
  const onChainId = boundOnChainId(marketplace);
  // Simulation only: the operator's address, no key needed.
  const operatorAddress = marketplace.operatorAddress;
  if (mode === "classic" || onChainId === null || !operatorAddress) {
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
      operatorPublicKey: operatorAddress,
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
              const totals = await getPeriodTotals(onChainId, k);
              const claimTx = claims.find((cl) => cl.periodId === k && entry.addresses.has(cl.memberAddress));
              return {
                periodId: k,
                startTs: totals.startTs,
                endTs: totals.distributed ? totals.endTs : status.periodEnd,
                status: totals.distributed ? "ended" : "current",
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
