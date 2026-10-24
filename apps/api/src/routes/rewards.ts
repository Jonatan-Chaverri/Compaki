// /api/rewards — Community Rewards.
//
//   GET  /marketplace/:slug                         treasury, periods, beneficiaries (public)
//   POST /marketplace/:slug/periods                 open a period (operator)
//   POST /marketplace/:slug/periods/:id/close       close an ended period (operator or beneficiary)
//   POST /marketplace/:slug/periods/:id/claim       claim the session user's reward
//                                                   (own wallets: 202 + tx to sign,
//                                                   finished by POST /api/tx/:id)
//   POST /marketplace/:slug/guarantees              simulate a forbidden action (operator)
//   GET  /me                                        session user's rewards across marketplaces
//
// Every balance, share and claim right in these payloads is read from the
// contract (see src/lib/rewards.ts). Postgres only adds tx hashes and names.
// Members with their own wallet sign their claims in the browser; for
// custodial accounts the backend signs with the key it holds, so there
// `require_auth` proves "the backend acted for this user" (README "Custody").

import { Hono } from "hono";

import { prisma } from "@/lib/db";
import {
  boundOnChainId,
  describeContractError,
  loadRewardsView,
  PERIOD_HISTORY_LIMIT,
} from "@/lib/rewards";
import { createPending, signatureRequest, type PendingTx } from "@/lib/pending-tx";
import { getSessionUser } from "@/lib/session";
import { personalWallet, userAddresses } from "@/lib/wallets";
import {
  claimReward,
  closeRewardsPeriod,
  createCustodialAccount,
  decryptSecret,
  getRewardsPeriod,
  getRewardsStatus,
  i128Of,
  isValidAccountAddress,
  openRewardsPeriod,
  prepareClaim,
  simulateForbiddenAction,
  stellarConfig,
  stellarExpertTxUrl,
  stroopsToUsd,
  usdToStroops,
} from "@/lib/stellar";

export const rewards = new Hono();

const MAX_BENEFICIARIES = 20; // mirrors the contract's MAX_BENEFICIARIES
const MAX_PERIOD_MINUTES = 366 * 24 * 60; // mirrors MAX_PERIOD_SECONDS
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const marketplaceSelect = {
  id: true,
  name: true,
  slug: true,
  operatorId: true,
  rewardsEnabled: true,
  splitCommunityBps: true,
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
  try {
    const view = await loadRewardsView(marketplace);
    return c.json({
      marketplace: { name: marketplace.name, slug: marketplace.slug },
      canManage: user?.id === marketplace.operatorId,
      viewerAddress: user ? viewerAddressOf(user) : null,
      rewards: view,
    });
  } catch (error) {
    const { body, status } = errorResponse(error, "Could not read rewards from the contract");
    return c.json(body, status);
  }
});

// ── POST /marketplace/:slug/periods — open a period ───────────────────────
//
// Body: { durationMinutes, beneficiaries: [{ email | address, shareBps }] }
// Emails must belong to existing Compaki users; a custodial payment account
// is provisioned for any member that doesn't have one yet.

rewards.post("/marketplace/:slug/periods", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in as the operator" }, 401);
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug: c.req.param("slug") },
    include: { operator: true },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  if (marketplace.operatorId !== user.id) {
    return c.json({ error: "Only the marketplace operator can open periods" }, 403);
  }
  const onChainId = boundOnChainId(marketplace);
  if (!marketplace.rewardsEnabled || onChainId === null) {
    return c.json({ error: "Community Rewards is not enabled for this marketplace" }, 400);
  }
  if (!marketplace.operator.stellarSecretEncrypted || !marketplace.operator.stellarPublicKey) {
    return c.json({ error: "Operator payment account missing" }, 409);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const durationMinutes = Number(b.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > MAX_PERIOD_MINUTES) {
    return c.json({ error: "Duration must be between 1 minute and 366 days" }, 400);
  }
  const rawMembers = Array.isArray(b.beneficiaries) ? b.beneficiaries : [];
  if (rawMembers.length === 0) return c.json({ error: "Add at least one beneficiary" }, 400);
  if (rawMembers.length > MAX_BENEFICIARIES) {
    return c.json({ error: `At most ${MAX_BENEFICIARIES} beneficiaries per period` }, 400);
  }

  const shareTotal = rawMembers.reduce(
    (acc: number, raw) => acc + Number((raw as Record<string, unknown> | null)?.shareBps),
    0,
  );
  if (shareTotal !== 10_000) {
    return c.json({ error: `Shares must add up to exactly 100% (got ${shareTotal / 100}%)` }, 400);
  }

  // Resolve every row to a Stellar address. Validation here gives friendly
  // messages; the contract re-validates everything on-chain.
  const resolved: { address: string; shareBps: number }[] = [];
  for (const raw of rawMembers) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const shareBps = Number(row.shareBps);
    if (!Number.isInteger(shareBps) || shareBps < 1 || shareBps > 10_000) {
      return c.json({ error: "Each share must be between 0.01% and 100%" }, 400);
    }
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    const address = typeof row.address === "string" ? row.address.trim() : "";
    if (address) {
      if (!isValidAccountAddress(address)) {
        return c.json({ error: `Invalid Stellar address: ${address.slice(0, 12)}…` }, 400);
      }
      resolved.push({ address, shareBps });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      return c.json({ error: "Each beneficiary needs a member email or a Stellar address" }, 400);
    }
    const member = await prisma.user.findUnique({ where: { email } });
    if (!member) {
      return c.json({ error: `No Compaki account for ${email} — ask them to sign up first` }, 400);
    }
    if (member.walletAddress && !member.walletReadyAt) {
      return c.json({ error: `${email} hasn't finished setting up their wallet yet` }, 400);
    }
    const personal = personalWallet(member);
    let memberAddress = personal.kind === "none" ? null : personal.address;
    if (!memberAddress) {
      const account = await createCustodialAccount();
      await prisma.user.update({
        where: { id: member.id },
        data: {
          stellarPublicKey: account.publicKey,
          stellarSecretEncrypted: account.secretEncrypted,
        },
      });
      memberAddress = account.publicKey;
    }
    resolved.push({ address: memberAddress, shareBps });
  }

  if (new Set(resolved.map((r) => r.address)).size !== resolved.length) {
    return c.json({ error: "Each beneficiary can only appear once" }, 400);
  }
  if (resolved.some((r) => r.address === marketplace.operator.stellarPublicKey)) {
    return c.json({ error: "The operator cannot be a beneficiary of its own community fund" }, 400);
  }

  try {
    // End time is anchored to ledger time, not the API server's clock.
    const { ledgerTime } = await getRewardsStatus(onChainId);
    const endTs = ledgerTime + durationMinutes * 60;
    const { periodId, txHash } = await openRewardsPeriod({
      operatorSecret: decryptSecret(marketplace.operator.stellarSecretEncrypted),
      marketplaceId: onChainId,
      beneficiaries: resolved.map((r) => r.address),
      sharesBps: resolved.map((r) => r.shareBps),
      endTs,
    });
    await prisma.rewardsPeriod.upsert({
      where: {
        marketplaceId_contractId_periodId: {
          marketplaceId: marketplace.id,
          contractId: stellarConfig.marketplaceContractId,
          periodId,
        },
      },
      update: { openTxHash: txHash },
      create: {
        marketplaceId: marketplace.id,
        contractId: stellarConfig.marketplaceContractId,
        periodId,
        openTxHash: txHash,
      },
    });
    return c.json({ periodId, txHash, verifyUrl: stellarExpertTxUrl(txHash) }, 201);
  } catch (error) {
    const { body, status } = errorResponse(error, "Could not open the period");
    return c.json(body, status);
  }
});

// ── POST /marketplace/:slug/periods/:id/close ──────────────────────────────
//
// The contract lets anyone close an ended period. The API limits the button
// to the operator and the period's beneficiaries, signing with their own
// custodial key (no authorization is required on-chain, only a fee payer).

rewards.post("/marketplace/:slug/periods/:id/close", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in first" }, 401);
  const periodId = Number(c.req.param("id"));
  if (!Number.isInteger(periodId) || periodId < 0) return c.json({ error: "Invalid period" }, 400);

  const marketplace = await prisma.marketplace.findUnique({
    where: { slug: c.req.param("slug") },
    select: { ...marketplaceSelect, operator: { select: { stellarSecretEncrypted: true } } },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  const onChainId = boundOnChainId(marketplace);
  if (!marketplace.rewardsEnabled || onChainId === null) {
    return c.json({ error: "Community Rewards is not enabled for this marketplace" }, 400);
  }
  if (!marketplace.operator.stellarSecretEncrypted) {
    return c.json({ error: "Operator payment account missing" }, 409);
  }

  try {
    const period = await getRewardsPeriod(onChainId, periodId);
    const mine = userAddresses(user);
    const allowed =
      user.id === marketplace.operatorId || period.beneficiaries.some((b) => mine.includes(b));
    if (!allowed) {
      return c.json({ error: "Only the operator or a beneficiary can close this period" }, 403);
    }
    // close_period needs no authorization on-chain, only a fee payer: the
    // marketplace's operator account pays, whoever clicked.
    const { totalStroops, txHash } = await closeRewardsPeriod({
      signerSecret: decryptSecret(marketplace.operator.stellarSecretEncrypted),
      marketplaceId: onChainId,
      periodId,
    });
    await prisma.rewardsPeriod.upsert({
      where: {
        marketplaceId_contractId_periodId: {
          marketplaceId: marketplace.id,
          contractId: stellarConfig.marketplaceContractId,
          periodId,
        },
      },
      update: { closeTxHash: txHash },
      create: {
        marketplaceId: marketplace.id,
        contractId: stellarConfig.marketplaceContractId,
        periodId,
        closeTxHash: txHash,
      },
    });
    return c.json({
      periodId,
      totalUsd: stroopsToUsd(totalStroops),
      txHash,
      verifyUrl: stellarExpertTxUrl(txHash),
    });
  } catch (error) {
    const { body, status } = errorResponse(error, "Could not close the period");
    return c.json(body, status);
  }
});

// ── POST /marketplace/:slug/periods/:id/claim ──────────────────────────────
//
// Claims for the session user only: the contract pays the address whose
// authorization it checks. An own wallet signs in the browser (202 + the
// transaction; POST /api/tx/:id submits it and calls completeClaim); a
// custodial account is signed by the backend.

/** Auxiliary record for the explorer link; the claim is already final on-chain. */
async function recordClaim(params: {
  marketplaceId: string;
  periodId: number;
  memberAddress: string;
  amountUsd: number;
  txHash: string;
}) {
  try {
    const periodRow = await prisma.rewardsPeriod.upsert({
      where: {
        marketplaceId_contractId_periodId: {
          marketplaceId: params.marketplaceId,
          contractId: stellarConfig.marketplaceContractId,
          periodId: params.periodId,
        },
      },
      update: {},
      create: {
        marketplaceId: params.marketplaceId,
        contractId: stellarConfig.marketplaceContractId,
        periodId: params.periodId,
      },
    });
    await prisma.rewardClaim.create({
      data: {
        periodRowId: periodRow.id,
        memberAddress: params.memberAddress,
        amountUsd: params.amountUsd,
        txHash: params.txHash,
      },
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
  if (!marketplace.rewardsEnabled || onChainId === null) {
    return c.json({ error: "Community Rewards is not enabled for this marketplace" }, 400);
  }

  try {
    const period = await getRewardsPeriod(onChainId, periodId);
    const notMember = () => c.json({ error: "You are not a beneficiary of this period." }, 403);

    // The user's own wallet is a member: they sign the claim themselves.
    if (user.walletAddress && period.beneficiaries.includes(user.walletAddress)) {
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
      return c.json(signatureRequest(pending, `Claim your period #${periodId} reward`), 202);
    }

    // Custodial member: the backend signs with the key it holds.
    if (
      !user.stellarPublicKey ||
      !user.stellarSecretEncrypted ||
      !period.beneficiaries.includes(user.stellarPublicKey)
    ) {
      return notMember();
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
      memberAddress: user.stellarPublicKey,
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

// ── POST /marketplace/:slug/guarantees — "try to break it" demo ───────────
//
// Body: { kind: "change-rules" | "withdraw" }. Evaluates the forbidden action
// with the operator's identity against the live contract (simulation with
// enforced auth — exactly what the network would execute) and reports the
// rejection. Nothing is submitted.

rewards.post("/marketplace/:slug/guarantees", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in as the operator" }, 401);
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug: c.req.param("slug") },
    include: { operator: { select: { stellarPublicKey: true } } },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  if (marketplace.operatorId !== user.id) {
    return c.json({ error: "Only the marketplace operator can run these checks" }, 403);
  }
  const onChainId = boundOnChainId(marketplace);
  if (!marketplace.rewardsEnabled || onChainId === null || !marketplace.operator.stellarPublicKey) {
    return c.json({ error: "Community Rewards is not enabled for this marketplace" }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const kind = (body as Record<string, unknown> | null)?.kind;
  if (kind !== "change-rules" && kind !== "withdraw") {
    return c.json({ error: "Unknown check" }, 400);
  }

  try {
    const status = await getRewardsStatus(onChainId);
    if (kind === "change-rules") {
      // Without a running period, opening a new one is the normal, allowed
      // flow — there are no committed rules to change.
      const latest =
        status.periodCount > 0 ? await getRewardsPeriod(onChainId, status.periodCount - 1) : null;
      if (!latest || status.ledgerTime >= latest.endTs) {
        return c.json({
          kind,
          applicable: false,
          message: "No period is running, so there are no committed rules to change. Open a period first.",
        });
      }
    }
    const held = status.totalContributedStroops - status.totalClaimedStroops;
    const result = await simulateForbiddenAction({
      kind,
      operatorPublicKey: marketplace.operator.stellarPublicKey,
      marketplaceId: onChainId,
      amountStroops: held > 0n ? held : usdToStroops(1),
    });
    return c.json({ kind, applicable: true, ...result });
  } catch (error) {
    const { body: errBody, status } = errorResponse(error, "Check could not be evaluated");
    return c.json(errBody, status);
  }
});

// ── GET /me — the session user's rewards ───────────────────────────────────
//
// Scans every rewards-enabled marketplace's recent periods on-chain for the
// user's address. Fine at demo scale; a production version would index the
// contract's p_open events instead.

rewards.get("/me", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const mine = userAddresses(user);
  if (mine.length === 0) return c.json({ address: null, marketplaces: [] });
  const address = viewerAddressOf(user);

  const candidates = await prisma.marketplace.findMany({
    where: {
      rewardsEnabled: true,
      contractId: stellarConfig.marketplaceContractId,
      contractMarketplaceId: { not: null },
    },
    select: marketplaceSelect,
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  try {
    const views = await Promise.all(
      candidates.map(async (m) => ({ marketplace: m, view: await loadRewardsView(m) })),
    );
    const marketplaces = views
      .map(({ marketplace, view }) => ({
        name: marketplace.name,
        slug: marketplace.slug,
        ledgerTime: view.ledgerTime,
        periods: view.periods
          .map((p) => {
            const member = p.beneficiaries.find((b) => mine.includes(b.address));
            if (!member) return null;
            return {
              periodId: p.periodId,
              startTs: p.startTs,
              endTs: p.endTs,
              status: p.status,
              totalUsd: p.totalUsd,
              shareBps: member.shareBps,
              projectedUsd: member.projectedUsd,
              amountUsd: member.amountUsd,
              claimed: member.claimed,
              claimTxHash: member.claimTxHash,
              closeTxHash: p.closeTxHash,
            };
          })
          .filter((p) => p !== null),
      }))
      .filter((m) => m.periods.length > 0);
    return c.json({ address, historyLimit: PERIOD_HISTORY_LIMIT, marketplaces });
  } catch (error) {
    const { body, status } = errorResponse(error, "Could not read rewards from the contract");
    return c.json(body, status);
  }
});
