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
import { boundOnChainId, loadRewardsView, PERIOD_HISTORY_LIMIT } from "@/lib/rewards";
import { isValidSlug } from "@/lib/slug";
import { getSessionUser } from "@/lib/session";
import { cavosWalletPending, personalWallet } from "@/lib/wallets";
import {
  createCustodialAccount,
  createMarketplace,
  createRewardsMarketplace,
  decryptSecret,
  getUsdBalance,
  registerVendor,
  stellarConfig,
  stellarExpertTxUrl,
} from "@/lib/stellar";
import { demoImpersonationEnabled } from "./demo";

export const marketplaces = new Hono();

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
  rewardsEnabled: boolean;
}

/** Display name of where the community share goes. */
export function communityFundLabel(m: {
  rewardsEnabled: boolean;
  communityFund: { name: string } | null;
}): string | null {
  if (m.rewardsEnabled) return "Community Rewards treasury (on-chain)";
  return m.communityFund?.name ?? null;
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
      (v) => Number.isInteger(v) && v >= 0 && v <= 10_000,
    ) ||
    vendorBps + operatorBps + communityBps !== 10_000
  ) {
    return "Revenue split must sum to 100%";
  }

  const rewardsEnabled = b.rewardsEnabled === true;
  if (rewardsEnabled && communityBps === 0) {
    return "Community Rewards needs a community share above 0%";
  }

  const community = parseCommunityDetails(b, communityBps > 0);
  if (typeof community === "string") return community;

  return {
    name,
    slug,
    description,
    category,
    vendorBps,
    operatorBps,
    communityBps,
    regenerativeEnabled: Boolean(b.regenerativeEnabled) || communityBps > 0,
    rewardsEnabled,
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
  let communityBalanceUsd: number | null = null;
  let verificationError: string | null = null;
  try {
    if (marketplace.rewardsEnabled) {
      rewards = await loadRewardsView(marketplace);
      if (!rewards.bound) verificationError = "This marketplace’s rewards fund is not connected yet. Verified amounts and recipients are unavailable.";
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
      rewardsEnabled: marketplace.rewardsEnabled,
      ...communityDetailsOf(marketplace),
      communityDetailsUpdatedAt: marketplace.communityDetailsUpdatedAt?.toISOString() ?? null,
      splits: { vendorBps: marketplace.splitVendorBps, operatorBps: marketplace.splitOperatorBps, communityBps: marketplace.splitCommunityBps },
      operator: { name: marketplace.operator.name, address: marketplace.operator.stellarPublicKey },
      communityFund: marketplace.communityFund ? { name: marketplace.communityFund.name, address: marketplace.communityFund.stellarPublicKey } : null,
      sellers: marketplace.vendors.map(v => ({ name: v.user.name, address: v.payoutAddress ?? v.user.stellarPublicKey })),
    },
    canManage: user?.id === marketplace.operatorId,
    sales: summarizeCommunitySales(sales),
    communityBalanceUsd,
    rewards,
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
  const details = parseCommunityDetails(body as Record<string, unknown>, marketplace.splitCommunityBps > 0);
  if (typeof details === "string") return c.json({ error: details }, 400);
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
      _count: { select: { products: true, vendors: true } },
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
      rewardsEnabled: m.rewardsEnabled,
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
// marketplaces), registers the marketplace on-chain (create_marketplace, or
// create_rewards_marketplace when Community Rewards is on — the community
// share is then held by the contract), and writes the DB records. Designed to be
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
        if (!operatorUser.stellarPublicKey || !operatorUser.stellarSecretEncrypted) {
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
        // Once registered on-chain, the split and rewards mode are frozen
        // there, so a re-submit must not change them off-chain either.
        const onChainFields = {
          splitVendorBps: input.vendorBps,
          splitOperatorBps: input.operatorBps,
          splitCommunityBps: input.communityBps,
          regenerativeEnabled: input.regenerativeEnabled,
          rewardsEnabled: input.rewardsEnabled,
        };
        let marketplace = await prisma.marketplace.upsert({
          where: { slug: input.slug },
          update: {
            name: input.name,
            description: input.description,
            category: input.category,
            ...communityDetailsOf(input),
            communityDetailsUpdatedAt: new Date(),
            ...(existing?.contractMarketplaceId ? {} : onChainFields),
          },
          create: {
            name: input.name,
            slug: input.slug,
            description: input.description,
            category: input.category,
            ...communityDetailsOf(input),
            communityDetailsUpdatedAt: new Date(),
            ...onChainFields,
            operatorId: operatorUser.id,
          },
          include: { communityFund: true },
        });

        // Rewards marketplaces need no fund account: the contract holds it.
        let fundUser = marketplace.communityFund;
        if (!marketplace.rewardsEnabled && !fundUser?.stellarPublicKey) {
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
        let contractMarketplaceId = marketplace.contractMarketplaceId;
        let createTxHash = marketplace.createTxHash;
        let contractId = marketplace.contractId;
        if (contractMarketplaceId === null) {
          if (!operatorUser.stellarSecretEncrypted) {
            throw new Error("Payment accounts missing after provisioning");
          }
          const split = {
            operatorSecret: decryptSecret(operatorUser.stellarSecretEncrypted),
            vendorBps: marketplace.splitVendorBps,
            operatorBps: marketplace.splitOperatorBps,
            communityBps: marketplace.splitCommunityBps,
          };
          let result;
          if (marketplace.rewardsEnabled) {
            result = await createRewardsMarketplace(split);
          } else {
            if (!fundUser?.stellarPublicKey) {
              throw new Error("Payment accounts missing after provisioning");
            }
            result = await createMarketplace({
              ...split,
              communityFundPublicKey: fundUser.stellarPublicKey,
            });
          }
          contractMarketplaceId = result.marketplaceId.toString();
          createTxHash = result.txHash;
          contractId = stellarConfig.marketplaceContractId;
        }
        stepDone("deploy");

        // ── 3. Store records ───────────────────────────────────────────
        stepStart("store");
        marketplace = await prisma.marketplace.update({
          where: { id: marketplace.id },
          data: { contractMarketplaceId, createTxHash, contractId },
          include: { communityFund: true },
        });
        stepDone("store");

        emit({
          type: "complete",
          marketplace: {
            id: marketplace.id,
            name: marketplace.name,
            slug: marketplace.slug,
            url: `compaki.app/m/${marketplace.slug}`,
            path: `/m/${marketplace.slug}`,
            dashboardPath: `/dashboard/${marketplace.slug}`,
            verifyUrl: createTxHash ? stellarExpertTxUrl(createTxHash) : null,
          },
        });
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
      rewardsEnabled: marketplace.rewardsEnabled,
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
        include: { vendor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!marketplace) return c.json({ error: "Marketplace not found" }, 404);
  if (marketplace.operatorId !== user.id) {
    return c.json({ error: "Only the marketplace operator can view this dashboard" }, 403);
  }

  const sales = await prisma.sale.findMany({
    where: { product: { marketplaceId: marketplace.id } },
    include: {
      product: { select: { name: true, vendor: { select: { name: true } } } },
      buyer: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Revenue by recipient, from the split snapshots frozen at purchase time.
  const parseSplitOrFallback = (raw: string, amountUsd: number) => {
    try {
      return parseSplitSnapshot(raw);
    } catch {
      // malformed snapshot — count everything as vendor share
      return { vendorAmountUsd: amountUsd, operatorAmountUsd: 0, communityAmountUsd: 0 };
    }
  };
  const splitsPerSale = sales.map((s) => parseSplitOrFallback(s.splitSnapshot, s.amountUsd));
  const sum = (pick: (s: (typeof splitsPerSale)[number]) => number) =>
    splitsPerSale.reduce((acc, s) => acc + pick(s), 0);

  return c.json({
    name: marketplace.name,
    slug: marketplace.slug,
    regenerativeEnabled: marketplace.regenerativeEnabled,
    rewardsEnabled: marketplace.rewardsEnabled,
    demoImpersonation: demoImpersonationEnabled(),
    community: communityDetailsOf(marketplace),
    splits: {
      vendorBps: marketplace.splitVendorBps,
      operatorBps: marketplace.splitOperatorBps,
      communityBps: marketplace.splitCommunityBps,
    },
    operatorAccount: marketplace.operator.stellarPublicKey,
    // Rewards marketplaces hold the community share in the contract; the
    // Community Rewards tab reads that treasury from chain instead.
    communityAccount: marketplace.rewardsEnabled
      ? null
      : marketplace.communityFund?.stellarPublicKey ?? null,
    stats: {
      totalSales: sales.length,
      grossVolume: sales.reduce((acc, s) => acc + s.amountUsd, 0),
      vendorRevenue: sum((s) => s.vendorAmountUsd),
      operatorRevenue: sum((s) => s.operatorAmountUsd),
      communityRevenue: sum((s) => s.communityAmountUsd),
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
    where: { marketplaceId: marketplace.id, vendorId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const sales = await prisma.sale.findMany({
    where: { product: { marketplaceId: marketplace.id, vendorId: user.id } },
    include: { product: { select: { name: true } } },
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
        amountUsd: s.amountUsd,
        vendorShareUsd,
        txHash: s.txHash,
        createdAt: s.createdAt.toISOString(),
      };
    }),
  });
});

// ── POST /:slug/vendors — vendor registration ──────────────────────────────
//
// Registers the SESSION user as a vendor: provisions their custodial payment
// account, registers them on-chain (register_vendor, signed by the operator's
// custodial key — the invite link implies operator approval), and records the
// membership. Idempotent: re-submitting resumes/returns.
//
// The vendor is always the signed-in user. (Earlier versions upserted a user
// by the email in the request body and returned that user's session cookie,
// which let anyone take over any account by knowing its email.)

marketplaces.post("/:slug/vendors", async (c) => {
  const slug = c.req.param("slug");
  const sessionUser = await getSessionUser(c);
  if (!sessionUser) return c.json({ error: "Sign in to join as a vendor" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const sells = typeof b.sells === "string" ? b.sells.trim().slice(0, 200) : "";

  const marketplace = await prisma.marketplace.findUnique({
    where: { slug },
    include: { operator: true },
  });
  const onChainId = marketplace ? boundOnChainId(marketplace) : null;
  if (!marketplace || onChainId === null) {
    return c.json({ error: "Marketplace not found" }, 404);
  }
  if (!marketplace.operator.stellarSecretEncrypted) {
    return c.json({ error: "Marketplace is not fully set up" }, 409);
  }

  if (cavosWalletPending(sessionUser)) {
    return c.json({ error: "Finish setting up your wallet first", code: "WALLET_SETUP" }, 409);
  }

  try {
    // 1. Payout address: the vendor's own Cavos wallet when they have one,
    //    else a custodial payment account.
    const vendor = sessionUser;
    const personal = personalWallet(vendor);
    let payoutAddress: string;
    if (personal.kind === "none") {
      const account = await createCustodialAccount();
      await prisma.user.update({
        where: { id: vendor.id },
        data: {
          stellarPublicKey: account.publicKey,
          stellarSecretEncrypted: account.secretEncrypted,
        },
      });
      payoutAddress = account.publicKey;
    } else {
      payoutAddress = personal.address;
    }

    // 2. Membership row (before the chain call so retries can resume).
    let membership = await prisma.vendorMembership.upsert({
      where: {
        marketplaceId_userId: { marketplaceId: marketplace.id, userId: vendor.id },
      },
      update: { sellsDescription: sells },
      create: {
        marketplaceId: marketplace.id,
        userId: vendor.id,
        sellsDescription: sells,
      },
    });

    // 3. On-chain vendor registration (skipped if a previous attempt landed).
    if (!membership.registerTxHash) {
      const { txHash } = await registerVendor({
        operatorSecret: decryptSecret(marketplace.operator.stellarSecretEncrypted),
        marketplaceId: onChainId,
        vendorPublicKey: payoutAddress,
      });
      membership = await prisma.vendorMembership.update({
        where: { id: membership.id },
        data: { registerTxHash: txHash, payoutAddress },
      });
    }

    return c.json({
      vendor: { id: vendor.id, name: vendor.name },
      marketplace: { name: marketplace.name, slug: marketplace.slug },
      vendorDashboardPath: `/vendor/${marketplace.slug}`,
      registerTxHash: membership.registerTxHash,
    });
  } catch (error) {
    console.error("[vendor-registration] failed:", error);
    return c.json(
      { error: "Could not finish your registration. Please try again." },
      500,
    );
  }
});
