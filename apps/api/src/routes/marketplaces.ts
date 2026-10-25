// /api/marketplaces — everything marketplace-scoped:
//
//   GET  /check-slug?slug=x        live slug availability for the wizard
//   POST /                         launch orchestrator (SSE stream)
//   GET  /:slug                    public info (join page)
//   GET  /:slug/dashboard          operator dashboard payload (operator only)
//   GET  /:slug/vendor-dashboard   session vendor's dashboard payload
//   POST /:slug/vendors            vendor registration (session user)

import { Hono } from "hono";

import { prisma, parseSplitSnapshot } from "@/lib/db";
import { parseCommunityDetails, summarizeCommunitySales, type CommunityDetails } from "@/lib/community";
import { fulfillmentOf } from "@/lib/fulfillment";
import { loadFundraiseView, parseFundraiseRecipients, type FundraiseRecipient } from "@/lib/fundraise";
import { communityModeOf, loadRewardsView, PERIOD_HISTORY_LIMIT, type CommunityMode } from "@/lib/rewards";
import { isValidSlug } from "@/lib/slug";
import { MARKETPLACE_SHARE_BPS, PLATFORM_FEE_BPS } from "@/lib/splits";
import { getSessionUser } from "@/lib/session";
import { ensureMarketplaceVendor, isSignatureRequest } from "@/lib/seller-registration";
import { SellerSetupError } from "@/lib/seller-errors";
import { finishLaunch, type LaunchContext } from "@/lib/launch";
import { ownWalletPending, personalWallet } from "@/lib/wallets";
import { createPending, signatureRequest } from "@/lib/pending-tx";
import {
  createCustodialAccount,
  createFundraiseMarketplaceCall,
  createMarketplaceCall,
  createRewardsMarketplaceCall,
  decryptSecret,
  invokeCall,
  marketplaceIdOf,
  prepareCall,
  type ContractCall,
  demoTrustlineState,
  getUsdBalance,
  isTestnet,
  isValidAccountAddress,
  stellarConfig,
  usdToStroops,
  type GoalPolicy,
} from "@/lib/stellar";
import { demoImpersonationEnabled } from "./demo";
import { createMarketplaceDeletion } from "./marketplace-deletion";
import { activeProducts, publishedProducts } from "@/lib/products";

export const marketplaces = new Hono();
marketplaces.route("/", createMarketplaceDeletion({ db: prisma, sessionUser: getSessionUser }));

const CATEGORIES = ["Coffee & agriculture", "Crafts", "Services", "Other"] as const;

interface LaunchInput extends CommunityDetails {
  name: string;
  slug: string;
  description: string;
  category: (typeof CATEGORIES)[number];
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
  regenerativeEnabled: boolean;
  communityMode: CommunityMode;
  /** rewards only */
  rewardsPeriodSeconds: number | null;
  rewardsVendorPoolBps: number | null;
  /** fundraise only (the target is communityGoalUsd) */
  fundraisePolicy: GoalPolicy | null;
  fundraiseRecipients: FundraiseRecipient[] | null;
}

const DAY = 24 * 60 * 60;
/** Rewards period lengths offered in the wizard: monthly, quarterly, half-yearly, yearly. */
export const REWARDS_PERIODS = [30 * DAY, 90 * DAY, 180 * DAY, 365 * DAY];
/** Testnet-only short period, so a demo can show a whole period and its claims. */
export const DEMO_REWARDS_PERIOD = 10 * 60;
const GOAL_POLICIES: GoalPolicy[] = ["stop", "new-round"];
const MAX_RECIPIENTS = 20; // mirrors the contract's MAX_RECIPIENTS

/** Display name of where the community share goes. */
export function communityFundLabel(m: {
  communityMode: string;
  communityFund: { name: string } | null;
}): string | null {
  const mode = communityModeOf(m);
  if (mode === "rewards") return "Community Rewards treasury (on-chain)";
  if (mode === "fundraise") return "Fundraising fund (on-chain)";
  return m.communityFund?.name ?? null;
}

function parseRecipients(raw: unknown): FundraiseRecipient[] | string {
  const rows = Array.isArray(raw) ? raw : [];
  if (rows.length === 0) return "Add at least one wallet to receive the funds";
  if (rows.length > MAX_RECIPIENTS) return `At most ${MAX_RECIPIENTS} recipient wallets`;
  const recipients: FundraiseRecipient[] = [];
  for (const row of rows) {
    const r = (row ?? {}) as Record<string, unknown>;
    const address = typeof r.address === "string" ? r.address.trim() : "";
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const shareBps = Number(r.shareBps);
    if (!isValidAccountAddress(address)) return `Invalid Stellar address: ${address.slice(0, 12) || "(empty)"}…`;
    if (label.length < 2 || label.length > 80) return "Give each recipient a public name (2–80 characters)";
    if (!Number.isInteger(shareBps) || shareBps < 1 || shareBps > 10_000) {
      return "Each recipient's share must be between 0.01% and 100%";
    }
    recipients.push({ address, label, shareBps });
  }
  if (new Set(recipients.map((r) => r.address)).size !== recipients.length) {
    return "Each wallet can only appear once";
  }
  const total = recipients.reduce((sum, r) => sum + r.shareBps, 0);
  if (total !== 10_000) return `Recipient shares must add up to exactly 100% (got ${total / 100}%)`;
  return recipients;
}

function parseInput(body: unknown): LaunchInput | string {
  if (typeof body !== "object" || body === null) return "Invalid payload";
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 2 || name.length > 60) return "Marketplace name must be 2–60 characters";

  const slug = typeof b.slug === "string" ? b.slug.trim() : "";
  if (!isValidSlug(slug)) return "Invalid URL slug";

  const description = typeof b.description === "string" ? b.description.trim().slice(0, 200) : "";

  const category = CATEGORIES.includes(b.category as (typeof CATEGORIES)[number])
    ? (b.category as (typeof CATEGORIES)[number])
    : "Other";

  const vendorBps = Number(b.vendorBps);
  const operatorBps = Number(b.operatorBps);
  const communityBps = Number(b.communityBps);
  if (
    ![vendorBps, operatorBps, communityBps].every(
      (v) => Number.isInteger(v) && v >= 0 && v <= MARKETPLACE_SHARE_BPS,
    ) ||
    vendorBps + operatorBps + communityBps !== MARKETPLACE_SHARE_BPS
  ) {
    return "Sellers, marketplace and community must add up to 98% (Compaki keeps a fixed 2%)";
  }

  const communityMode: CommunityMode =
    b.communityMode === "rewards" || b.communityMode === "fundraise" ? b.communityMode : "classic";
  if (communityMode !== "classic" && communityBps === 0) {
    return communityMode === "rewards"
      ? "Community Rewards needs a community share above 0%"
      : "Fundraising needs a community share above 0%";
  }

  const community = parseCommunityDetails(b, communityBps > 0, communityBps > 0 && communityMode === "classic");
  if (typeof community === "string") return community;

  let rewardsPeriodSeconds: number | null = null;
  let rewardsVendorPoolBps: number | null = null;
  let fundraisePolicy: GoalPolicy | null = null;
  let fundraiseRecipients: FundraiseRecipient[] | null = null;
  if (communityMode === "rewards") {
    rewardsPeriodSeconds = Number(b.rewardsPeriodSeconds);
    const allowed = isTestnet() ? [DEMO_REWARDS_PERIOD, ...REWARDS_PERIODS] : REWARDS_PERIODS;
    if (!allowed.includes(rewardsPeriodSeconds)) return "Choose how often rewards are shared";
    rewardsVendorPoolBps = Number(b.rewardsVendorPoolBps);
    if (!Number.isInteger(rewardsVendorPoolBps) || rewardsVendorPoolBps < 0 || rewardsVendorPoolBps > 10_000) {
      return "The sellers' and buyers' parts of the rewards must add up to 100%";
    }
  }
  if (communityMode === "fundraise") {
    if (community.communityGoalUsd === null) return "Set the fundraising target";
    if (!GOAL_POLICIES.includes(b.fundraisePolicy as GoalPolicy)) {
      return "Choose what happens when the target is reached";
    }
    fundraisePolicy = b.fundraisePolicy as GoalPolicy;
    const recipients = parseRecipients(b.fundraiseRecipients);
    if (typeof recipients === "string") return recipients;
    fundraiseRecipients = recipients;
  }

  return {
    name,
    slug,
    description,
    category,
    vendorBps,
    operatorBps,
    communityBps,
    regenerativeEnabled: Boolean(b.regenerativeEnabled) || communityBps > 0,
    communityMode,
    rewardsPeriodSeconds,
    rewardsVendorPoolBps,
    fundraisePolicy,
    fundraiseRecipients,
    ...community,
  };
}

function communityDetailsOf(m: CommunityDetails): CommunityDetails {
  return {
    communityPurpose: m.communityPurpose,
    communityBeneficiaries: m.communityBeneficiaries,
    communityDistribution: m.communityDistribution,
    communityGoalUsd: m.communityGoalUsd,
  };
}

// Public transparency view: no private emails, keys, buyer or shipping details.
marketplaces.get("/:slug/community", async (c) => {
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug: c.req.param("slug") },
    include: {
      operator: { select: { name: true, stellarPublicKey: true } },
      communityFund: { select: { name: true, stellarPublicKey: true } },
      vendors: { include: { user: { select: { name: true, stellarPublicKey: true } } } },
    },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  const [user, sales] = await Promise.all([
    getSessionUser(c),
    prisma.sale.findMany({
      where: { product: { marketplaceId: marketplace.id } },
      select: { amountUsd: true, splitSnapshot: true },
    }),
  ]);
  let rewards: Awaited<ReturnType<typeof loadRewardsView>> | null = null;
  let fundraise: Awaited<ReturnType<typeof loadFundraiseView>> | null = null;
  let communityBalanceUsd: number | null = null;
  let verificationError: string | null = null;
  const mode = communityModeOf(marketplace);
  try {
    if (mode === "rewards") {
      rewards = await loadRewardsView(marketplace);
      if (!rewards.bound) verificationError = "This marketplace’s rewards fund is not connected yet. Verified amounts and recipients are unavailable.";
    } else if (mode === "fundraise") {
      fundraise = await loadFundraiseView(marketplace);
      if (!fundraise.bound) verificationError = "This marketplace’s fundraising fund is not connected yet. Verified amounts and recipients are unavailable.";
    } else if (marketplace.splitCommunityBps > 0 && marketplace.communityFund?.stellarPublicKey) {
      communityBalanceUsd = await getUsdBalance(marketplace.communityFund.stellarPublicKey);
    }
  } catch (error) {
    console.error("[community] verification unavailable:", error);
    verificationError = "Live fund information is temporarily unavailable. We are not showing an unverified balance or payout schedule.";
  }
  return c.json({
    marketplace: {
      name: marketplace.name, slug: marketplace.slug,
      regenerativeEnabled: marketplace.regenerativeEnabled,
      communityMode: mode,
      ...communityDetailsOf(marketplace),
      communityDetailsUpdatedAt: marketplace.communityDetailsUpdatedAt?.toISOString() ?? null,
      splits: { vendorBps: marketplace.splitVendorBps, operatorBps: marketplace.splitOperatorBps, communityBps: marketplace.splitCommunityBps },
      operator: { name: marketplace.operator.name, address: marketplace.operatorAddress ?? marketplace.operator.stellarPublicKey },
      communityFund: marketplace.communityFund ? { name: marketplace.communityFund.name, address: marketplace.communityFund.stellarPublicKey } : null,
      sellers: marketplace.vendors.map(v => ({ name: v.user.name, address: v.payoutAddress ?? v.user.stellarPublicKey })),
    },
    canManage: user?.id === marketplace.operatorId,
    sales: summarizeCommunitySales(sales),
    communityBalanceUsd,
    rewards,
    fundraise,
    verificationError,
    verifiedAt: new Date().toISOString(),
    historyLimit: PERIOD_HISTORY_LIMIT,
  });
});

// Editing the public narrative never edits contract splits or beneficiaries.
marketplaces.patch("/:slug/community", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in as the marketplace organizer" }, 401);
  const marketplace = await prisma.marketplace.findUnique({ where: { slug: c.req.param("slug") } });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  if (marketplace.operatorId !== user.id) return c.json({ error: "Only this marketplace’s organizer can edit its community details" }, 403);
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Invalid payload" }, 400);
  const mode = communityModeOf(marketplace);
  const details = parseCommunityDetails(body as Record<string, unknown>, marketplace.splitCommunityBps > 0, marketplace.splitCommunityBps > 0 && mode === "classic");
  if (typeof details === "string") return c.json({ error: details }, 400);
  // A fundraising target is part of the contract rules: it can't be edited.
  if (mode === "fundraise") details.communityGoalUsd = marketplace.communityGoalUsd;
  const updated = await prisma.marketplace.update({ where: { id: marketplace.id }, data: { ...details, communityDetailsUpdatedAt: new Date() } });
  return c.json({ community: communityDetailsOf(updated), updatedAt: updated.communityDetailsUpdatedAt?.toISOString() });
});

// ── GET /check-slug ────────────────────────────────────────────────────────

marketplaces.get("/check-slug", async (c) => {
  const slug = c.req.query("slug") ?? "";
  if (!isValidSlug(slug)) {
    return c.json({ available: false, reason: "invalid" });
  }
  const existing = await prisma.marketplace.findUnique({
    where: { slug },
    select: { id: true },
  });
  return c.json({
    available: existing === null,
    reason: existing ? "taken" : null,
  });
});

// ── GET /directory — public list of every marketplace on Compaki ───────────
// Registered before /:slug so the static path wins.

marketplaces.get("/directory", async (c) => {
  const rows = await prisma.marketplace.findMany({
    include: {
      communityFund: { select: { name: true } },
      _count: { select: { products: { where: publishedProducts }, vendors: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    marketplaces: rows.map((m) => ({
      name: m.name,
      slug: m.slug,
      description: m.description,
      category: m.category,
      regenerativeEnabled: m.regenerativeEnabled,
      communityMode: communityModeOf(m),
      splitCommunityBps: m.splitCommunityBps,
      communityFundName: communityFundLabel(m),
      productCount: m._count.products,
      vendorCount: m._count.vendors,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

// ── POST / — the launch orchestrator ───────────────────────────────────────
//
// Streams progress as Server-Sent Events while it: provisions custodial
// payment accounts (operator, plus a community fund account for classic
// marketplaces), registers the marketplace on-chain (create_marketplace,
// create_rewards_marketplace or create_fundraise_marketplace — for the last
// two the community share is held by the contract), and writes the DB
// records. Designed to be
// retried: every step reuses whatever a previous attempt already created
// (operator by email, marketplace + fund by slug, on-chain id if present).

type LaunchStep = "accounts" | "deploy" | "store";

marketplaces.post("/", async (c) => {
  const sessionUser = await getSessionUser(c);
  if (!sessionUser) {
    return c.json({ error: "Sign in to create a marketplace" }, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const input = parseInput(body);
  if (typeof input === "string") {
    return c.json({ error: input }, 400);
  }

  // If the slug belongs to someone else's marketplace, fail fast.
  const existing = await prisma.marketplace.findUnique({
    where: { slug: input.slug },
    select: { operatorId: true, contractMarketplaceId: true },
  });
  if (existing && existing.operatorId !== sessionUser.id) {
    return c.json({ error: "That URL is already taken" }, 409);
  }

  // A release pays every recipient in one transaction, so each wallet must
  // already accept the demo asset or the funds could never be released.
  if (input.fundraiseRecipients) {
    for (const r of input.fundraiseRecipients) {
      const state = await demoTrustlineState(r.address);
      if (state !== "ready") {
        const why = state === "missing" ? "doesn't exist on Stellar testnet" : `doesn't accept ${stellarConfig.usdcCode} yet`;
        return c.json({ error: `${r.label}'s wallet ${why}. Ask them to sign in to Compaki once with that wallet (or add a ${stellarConfig.usdcCode} trustline), then try again.` }, 400);
      }
    }
  }

  // Owners with their own wallet register the marketplace with it (they sign
  // in the browser); everyone else with their custodial account.
  if (ownWalletPending(sessionUser)) {
    return c.json({ error: "Finish setting up your wallet before launching a marketplace", code: "WALLET_SETUP" }, 409);
  }
  const ownWallet = personalWallet(sessionUser);

  const operator = await prisma.user.update({
    where: { id: sessionUser.id },
    data: { role: "OPERATOR" },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const stepStart = (step: LaunchStep) => emit({ type: "step", step, status: "start" });
      const stepDone = (step: LaunchStep) => emit({ type: "step", step, status: "done" });

      try {
        // ── 1. Payment accounts ────────────────────────────────────────
        stepStart("accounts");

        let operatorUser = operator;
        if (ownWallet.kind !== "own" && (!operatorUser.stellarPublicKey || !operatorUser.stellarSecretEncrypted)) {
          const account = await createCustodialAccount();
          operatorUser = await prisma.user.update({
            where: { id: operator.id },
            data: {
              stellarPublicKey: account.publicKey,
              stellarSecretEncrypted: account.secretEncrypted,
            },
          });
        }

        // Marketplace row early (contract id null) so retries can resume.
        // Once registered on-chain, the split and community rules are frozen
        // there, so a re-submit must not change them off-chain either.
        const { communityGoalUsd, ...details } = communityDetailsOf(input);
        const onChainFields = {
          splitVendorBps: input.vendorBps,
          splitOperatorBps: input.operatorBps,
          splitCommunityBps: input.communityBps,
          regenerativeEnabled: input.regenerativeEnabled,
          communityMode: input.communityMode,
          rewardsPeriodSeconds: input.rewardsPeriodSeconds,
          rewardsVendorPoolBps: input.rewardsVendorPoolBps,
          fundraisePolicy: input.fundraisePolicy,
          fundraiseRecipients: input.fundraiseRecipients ?? undefined,
          ...(input.communityMode === "fundraise" ? { communityGoalUsd } : {}),
        };
        const goalField = input.communityMode === "fundraise" ? {} : { communityGoalUsd };
        let marketplace = await prisma.marketplace.upsert({
          where: { slug: input.slug },
          update: {
            name: input.name,
            description: input.description,
            category: input.category,
            ...details,
            ...goalField,
            communityDetailsUpdatedAt: new Date(),
            ...(existing?.contractMarketplaceId ? {} : onChainFields),
          },
          create: {
            name: input.name,
            slug: input.slug,
            description: input.description,
            category: input.category,
            ...details,
            ...goalField,
            communityDetailsUpdatedAt: new Date(),
            ...onChainFields,
            operatorId: operatorUser.id,
          },
          include: { communityFund: true },
        });

        // Rewards and fundraising marketplaces need no fund account: the
        // contract holds the community share.
        const mode = communityModeOf(marketplace);
        let fundUser = marketplace.communityFund;
        if (mode === "classic" && !fundUser?.stellarPublicKey) {
          const account = await createCustodialAccount();
          fundUser = fundUser
            ? await prisma.user.update({
                where: { id: fundUser.id },
                data: {
                  stellarPublicKey: account.publicKey,
                  stellarSecretEncrypted: account.secretEncrypted,
                },
              })
            : await prisma.user.create({
                data: {
                  name: `${input.name} Community Fund`,
                  role: "COMMUNITY",
                  stellarPublicKey: account.publicKey,
                  stellarSecretEncrypted: account.secretEncrypted,
                },
              });
          marketplace = await prisma.marketplace.update({
            where: { id: marketplace.id },
            data: { communityFundId: fundUser.id },
            include: { communityFund: true },
          });
        }
        stepDone("accounts");

        // ── 2. On-chain registration ───────────────────────────────────
        stepStart("deploy");
        let registration: { contractMarketplaceId: string; createTxHash: string | null; operatorAddress: string } | null =
          marketplace.contractMarketplaceId && marketplace.operatorAddress
            ? {
                contractMarketplaceId: marketplace.contractMarketplaceId,
                createTxHash: marketplace.createTxHash,
                operatorAddress: marketplace.operatorAddress,
              }
            : null;
        if (registration === null) {
          const operatorAddress = ownWallet.kind === "own" ? ownWallet.address : operatorUser.stellarPublicKey;
          if (!operatorAddress) throw new Error("Payment accounts missing after provisioning");
          const split = {
            operator: operatorAddress,
            vendorBps: marketplace.splitVendorBps,
            operatorBps: marketplace.splitOperatorBps,
            communityBps: marketplace.splitCommunityBps,
          };
          let call: ContractCall;
          if (mode === "rewards") {
            call = createRewardsMarketplaceCall({
              ...split,
              periodSeconds: marketplace.rewardsPeriodSeconds ?? REWARDS_PERIODS[0],
              vendorPoolBps: marketplace.rewardsVendorPoolBps ?? 5_000,
            });
          } else if (mode === "fundraise") {
            const recipients = parseFundraiseRecipients(marketplace.fundraiseRecipients);
            if (!marketplace.communityGoalUsd || recipients.length === 0 || !marketplace.fundraisePolicy) {
              throw new Error("Fundraising rules missing");
            }
            call = createFundraiseMarketplaceCall({
              ...split,
              targetStroops: usdToStroops(marketplace.communityGoalUsd),
              recipients: recipients.map((r) => r.address),
              sharesBps: recipients.map((r) => r.shareBps),
              policy: marketplace.fundraisePolicy === "stop" ? "stop" : "new-round",
            });
          } else {
            if (!fundUser?.stellarPublicKey) {
              throw new Error("Payment accounts missing after provisioning");
            }
            call = createMarketplaceCall({ ...split, communityFund: fundUser.stellarPublicKey });
          }

          if (ownWallet.kind === "own") {
            // The owner's wallet signs; POST /api/tx/:id finishes the launch.
            const prepared = await prepareCall(call, operatorAddress);
            const pending = createPending<LaunchContext>({
              kind: "create-marketplace",
              userId: operator.id,
              signer: operatorAddress,
              xdr: prepared.xdr,
              hash: prepared.hash,
              context: { marketplaceId: marketplace.id },
            });
            emit({ type: "signature", ...signatureRequest(pending, "Create your marketplace") });
            return;
          }
          if (!operatorUser.stellarSecretEncrypted) throw new Error("Payment accounts missing after provisioning");
          const { txHash, returnValue } = await invokeCall(call, decryptSecret(operatorUser.stellarSecretEncrypted));
          registration = {
            contractMarketplaceId: marketplaceIdOf(returnValue).toString(),
            createTxHash: txHash,
            operatorAddress,
          };
        }
        stepDone("deploy");

        // ── 3. Store records ───────────────────────────────────────────
        stepStart("store");
        const launched = await finishLaunch(marketplace.id, registration);
        stepDone("store");

        emit({ type: "complete", marketplace: launched });
      } catch (error) {
        console.error("[launch] failed:", error);
        emit({
          type: "error",
          message:
            "Something went wrong while setting up your marketplace. Nothing is lost — you can retry.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});

// ── GET /:slug — public info for the join page ─────────────────────────────

marketplaces.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug },
    select: { name: true, slug: true, description: true, splitVendorBps: true },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  return c.json({ marketplace });
});

// ── GET /:slug/storefront — public storefront payload ──────────────────────

marketplaces.get("/:slug/storefront", async (c) => {
  const slug = c.req.param("slug");
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug },
    include: {
      communityFund: { select: { name: true } },
      products: {
        where: publishedProducts,
        include: { vendor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);

  return c.json({
    marketplace: {
      name: marketplace.name,
      slug: marketplace.slug,
      description: marketplace.description,
      category: marketplace.category,
      regenerativeEnabled: marketplace.regenerativeEnabled,
      communityMode: communityModeOf(marketplace),
      splitCommunityBps: marketplace.splitCommunityBps,
      communityFundName: communityFundLabel(marketplace),
      ...communityDetailsOf(marketplace),
    },
    products: marketplace.products.map((p) => ({
      id: p.id,
      name: p.name,
      shortDescription: p.shortDescription,
      priceUsd: p.priceUsd,
      stock: p.stock,
      imageUrl: p.imageUrl,
      vendorId: p.vendorId,
      vendorName: p.vendor.name,
    })),
  });
});

// ── GET /:slug/dashboard — operator dashboard payload ──────────────────────

marketplaces.get("/:slug/dashboard", async (c) => {
  const slug = c.req.param("slug");
  // Vendor emails and payment accounts are operator-only information.
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Sign in as the operator" }, 401);
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug },
    include: {
      operator: { select: { id: true, name: true, stellarPublicKey: true } },
      communityFund: { select: { id: true, name: true, stellarPublicKey: true } },
      vendors: {
        include: {
          user: { select: { id: true, name: true, email: true, stellarPublicKey: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      products: {
        where: publishedProducts,
        include: { vendor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  if (marketplace.operatorId !== user.id) {
    return c.json({ error: "Only the marketplace operator can view this dashboard" }, 403);
  }

  // The feed shows the latest 50 sales; the totals cover all of them.
  const [sales, allSales] = await Promise.all([
    prisma.sale.findMany({
      where: { product: { marketplaceId: marketplace.id } },
      include: {
        product: { select: { name: true, vendor: { select: { name: true } } } },
        buyer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.sale.findMany({
      where: { product: { marketplaceId: marketplace.id } },
      select: { amountUsd: true, splitSnapshot: true },
    }),
  ]);

  // Revenue by recipient, from the split snapshots frozen at purchase time.
  const parseSplitOrFallback = (raw: string, amountUsd: number) => {
    try {
      return parseSplitSnapshot(raw);
    } catch {
      // malformed snapshot — count everything as vendor share
      return { vendorAmountUsd: amountUsd, operatorAmountUsd: 0, communityAmountUsd: 0, platformAmountUsd: 0 };
    }
  };
  const splitsPerSale = allSales.map((s) => parseSplitOrFallback(s.splitSnapshot, s.amountUsd));
  const sum = (pick: (s: (typeof splitsPerSale)[number]) => number) =>
    splitsPerSale.reduce((acc, s) => acc + pick(s), 0);

  return c.json({
    name: marketplace.name,
    slug: marketplace.slug,
    regenerativeEnabled: marketplace.regenerativeEnabled,
    communityMode: communityModeOf(marketplace),
    demoImpersonation: demoImpersonationEnabled(),
    community: communityDetailsOf(marketplace),
    splits: {
      vendorBps: marketplace.splitVendorBps,
      operatorBps: marketplace.splitOperatorBps,
      communityBps: marketplace.splitCommunityBps,
      platformBps: PLATFORM_FEE_BPS,
    },
    // Where the operator share lands: the owner's own wallet or their custodial account.
    operatorAccount: marketplace.operatorAddress ?? marketplace.operator.stellarPublicKey,
    // Rewards and fundraising marketplaces hold the community share in the
    // contract; their community tab reads that fund from chain instead.
    communityAccount: communityModeOf(marketplace) !== "classic"
      ? null
      : marketplace.communityFund?.stellarPublicKey ?? null,
    stats: {
      totalSales: allSales.length,
      grossVolume: allSales.reduce((acc, s) => acc + s.amountUsd, 0),
      vendorRevenue: sum((s) => s.vendorAmountUsd),
      operatorRevenue: sum((s) => s.operatorAmountUsd),
      communityRevenue: sum((s) => s.communityAmountUsd),
      platformRevenue: sum((s) => s.platformAmountUsd ?? 0),
    },
    sales: sales.map((s) => ({
      id: s.id,
      productName: s.product.name,
      vendorName: s.product.vendor.name,
      buyerName: s.buyer.name,
      amountUsd: s.amountUsd,
      txHash: s.txHash,
      createdAt: s.createdAt.toISOString(),
    })),
    vendors: marketplace.vendors.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email ?? "",
      sells: m.sellsDescription,
      account: m.payoutAddress ?? m.user.stellarPublicKey,
      registerTxHash: m.registerTxHash,
      joinedAt: m.createdAt.toISOString(),
      productCount: marketplace.products.filter((p) => p.vendorId === m.user.id).length,
    })),
    catalog: marketplace.products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceUsd: p.priceUsd,
      stock: p.stock,
      imageUrl: p.imageUrl,
      vendorName: p.vendor.name,
    })),
  });
});

// ── GET /:slug/vendor-dashboard — session vendor's view ────────────────────

marketplaces.get("/:slug/vendor-dashboard", async (c) => {
  const slug = c.req.param("slug");
  const marketplace = await prisma.marketplace.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, splitVendorBps: true },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);

  const user = await getSessionUser(c);
  const membership = user
    ? await prisma.vendorMembership.findUnique({
        where: { marketplaceId_userId: { marketplaceId: marketplace.id, userId: user.id } },
      })
    : null;

  const payoutAddress = membership?.payoutAddress ?? user?.stellarPublicKey ?? null;
  if (!user || !membership || !payoutAddress) {
    return c.json({
      member: false as const,
      marketplace: { name: marketplace.name, slug: marketplace.slug },
    });
  }

  const products = await prisma.product.findMany({
    where: { marketplaceId: marketplace.id, vendorId: user.id, ...activeProducts },
    orderBy: { createdAt: "desc" },
  });
  const sales = await prisma.sale.findMany({
    where: { product: { marketplaceId: marketplace.id, vendorId: user.id } },
    include: { product: { select: { name: true } }, buyer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return c.json({
    member: true as const,
    marketplace: {
      name: marketplace.name,
      slug: marketplace.slug,
      splitVendorBps: marketplace.splitVendorBps,
    },
    vendor: { name: user.name, account: payoutAddress },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      shortDescription: p.shortDescription,
      description: p.description,
      priceUsd: p.priceUsd,
      stock: p.stock,
      imageUrl: p.imageUrl,
      visibility: p.visibility,
      marketplace: { name: marketplace.name, slug: marketplace.slug },
    })),
    sales: sales.map((s) => {
      let vendorShareUsd = s.amountUsd;
      try {
        vendorShareUsd = parseSplitSnapshot(s.splitSnapshot).vendorAmountUsd;
      } catch {
        // legacy/malformed snapshot — fall back to gross
      }
      return {
        id: s.id,
        productName: s.product.name,
        marketplace: { name: marketplace.name, slug: marketplace.slug },
        quantity: s.quantity,
        amountUsd: s.amountUsd,
        vendorShareUsd,
        txHash: s.txHash,
        createdAt: s.createdAt.toISOString(),
        // Where to send it: the seller fulfils their own items. Null for
        // sales recorded before checkout asked for an address.
        fulfillment: fulfillmentOf(s),
        shipTo: s.shipAddress
          ? {
              name: s.buyer.name,
              address: s.shipAddress,
              city: s.shipCity ?? "",
              postalCode: s.shipPostalCode ?? "",
              country: s.shipCountry ?? "",
            }
          : null,
      };
    }),
  });
});

// Compatibility for older clients: enable the global seller profile, then
// prepare payment registration in the requested marketplace.
marketplaces.post("/:slug/vendors", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const marketplace = await prisma.marketplace.findUnique({ where: { slug: c.req.param("slug") } });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  await prisma.user.update({ where: { id: user.id }, data: { isSeller: true } });
  try {
    const membership = await ensureMarketplaceVendor(user.id, marketplace.id);
    if (isSignatureRequest(membership)) return c.json(membership, 202);
    return c.json({
      vendor: { id: user.id, name: user.name },
      marketplace: { name: marketplace.name, slug: marketplace.slug },
      vendorDashboardPath: "/vendor",
      registerTxHash: membership.registerTxHash,
    });
  } catch (error) {
    if (error instanceof SellerSetupError) return c.json({ error: error.message }, 409);
    console.error("[vendor-registration] failed:", error);
    return c.json({ error: "Could not finish your registration. Please try again." }, 503);
  }
});
