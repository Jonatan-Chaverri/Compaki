// /api/marketplaces — everything marketplace-scoped:
//
//   GET  /check-slug?slug=x        live slug availability for the wizard
//   POST /                         launch orchestrator (SSE stream)
//   GET  /:slug                    public info (join page)
//   GET  /:slug/dashboard          operator dashboard payload
//   GET  /:slug/vendor-dashboard   session vendor's dashboard payload
//   POST /:slug/vendors            vendor registration

import { Hono } from "hono";

import { prisma, parseSplitSnapshot } from "@/lib/db";
import { isValidSlug } from "@/lib/slug";
import { getSessionUser, sessionCookieHeader } from "@/lib/session";
import {
  createCustodialAccount,
  createMarketplace,
  decryptSecret,
  registerVendor,
  stellarExpertTxUrl,
} from "@/lib/stellar";

export const marketplaces = new Hono();

const CATEGORIES = ["Coffee & agriculture", "Crafts", "Services", "Other"] as const;

interface LaunchInput {
  name: string;
  slug: string;
  description: string;
  category: (typeof CATEGORIES)[number];
  vendorBps: number;
  operatorBps: number;
  communityBps: number;
  regenerativeEnabled: boolean;
  operatorName: string;
  operatorEmail: string;
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

  const operatorName = typeof b.operatorName === "string" ? b.operatorName.trim() : "";
  if (operatorName.length < 2) return "Please tell us your name";

  const operatorEmail =
    typeof b.operatorEmail === "string" ? b.operatorEmail.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(operatorEmail)) return "Invalid email address";

  return {
    name,
    slug,
    description,
    category,
    vendorBps,
    operatorBps,
    communityBps,
    regenerativeEnabled: Boolean(b.regenerativeEnabled) || communityBps > 0,
    operatorName,
    operatorEmail,
  };
}

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

// ── POST / — the launch orchestrator ───────────────────────────────────────
//
// Streams progress as Server-Sent Events while it: provisions custodial
// payment accounts (operator + community fund), registers the marketplace
// on-chain (create_marketplace), and writes the DB records. Designed to be
// retried: every step reuses whatever a previous attempt already created
// (operator by email, marketplace + fund by slug, on-chain id if present).

type LaunchStep = "accounts" | "deploy" | "store";

marketplaces.post("/", async (c) => {
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

  // If the slug belongs to someone else's finished marketplace, fail fast.
  const existing = await prisma.marketplace.findUnique({
    where: { slug: input.slug },
    include: { operator: true },
  });
  if (existing && existing.operator.email !== input.operatorEmail) {
    return c.json({ error: "That URL is already taken" }, 409);
  }

  // Operator user exists before the stream starts so we can set the session
  // cookie on the response headers.
  const operator = await prisma.user.upsert({
    where: { email: input.operatorEmail },
    update: { name: input.operatorName, role: "OPERATOR" },
    create: {
      email: input.operatorEmail,
      name: input.operatorName,
      role: "OPERATOR",
    },
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
        let marketplace = await prisma.marketplace.upsert({
          where: { slug: input.slug },
          update: {
            name: input.name,
            description: input.description,
            category: input.category,
            splitVendorBps: input.vendorBps,
            splitOperatorBps: input.operatorBps,
            splitCommunityBps: input.communityBps,
            regenerativeEnabled: input.regenerativeEnabled,
          },
          create: {
            name: input.name,
            slug: input.slug,
            description: input.description,
            category: input.category,
            splitVendorBps: input.vendorBps,
            splitOperatorBps: input.operatorBps,
            splitCommunityBps: input.communityBps,
            regenerativeEnabled: input.regenerativeEnabled,
            operatorId: operatorUser.id,
          },
          include: { communityFund: true },
        });

        let fundUser = marketplace.communityFund;
        if (!fundUser?.stellarPublicKey) {
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
        if (contractMarketplaceId === null) {
          if (!operatorUser.stellarSecretEncrypted || !fundUser.stellarPublicKey) {
            throw new Error("Payment accounts missing after provisioning");
          }
          const result = await createMarketplace({
            operatorSecret: decryptSecret(operatorUser.stellarSecretEncrypted),
            communityFundPublicKey: fundUser.stellarPublicKey,
            vendorBps: input.vendorBps,
            operatorBps: input.operatorBps,
            communityBps: input.communityBps,
          });
          contractMarketplaceId = result.marketplaceId.toString();
          createTxHash = result.txHash;
        }
        stepDone("deploy");

        // ── 3. Store records ───────────────────────────────────────────
        stepStart("store");
        marketplace = await prisma.marketplace.update({
          where: { id: marketplace.id },
          data: { contractMarketplaceId, createTxHash },
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
      "Set-Cookie": sessionCookieHeader(operator.id),
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
      splitCommunityBps: marketplace.splitCommunityBps,
      communityFundName: marketplace.communityFund?.name ?? null,
    },
    products: marketplace.products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceUsd: p.priceUsd,
      imageUrl: p.imageUrl,
      vendorName: p.vendor.name,
    })),
  });
});

// ── GET /:slug/dashboard — operator dashboard payload ──────────────────────

marketplaces.get("/:slug/dashboard", async (c) => {
  const slug = c.req.param("slug");
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
    splits: {
      vendorBps: marketplace.splitVendorBps,
      operatorBps: marketplace.splitOperatorBps,
      communityBps: marketplace.splitCommunityBps,
    },
    operatorAccount: marketplace.operator.stellarPublicKey,
    communityAccount: marketplace.communityFund?.stellarPublicKey ?? null,
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
      account: m.user.stellarPublicKey,
      registerTxHash: m.registerTxHash,
      joinedAt: m.createdAt.toISOString(),
      productCount: marketplace.products.filter((p) => p.vendorId === m.user.id).length,
    })),
    catalog: marketplace.products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceUsd: p.priceUsd,
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

  if (!user || !membership || !user.stellarPublicKey) {
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
    vendor: { name: user.name, account: user.stellarPublicKey },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceUsd: p.priceUsd,
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
// Creates/reuses the vendor user, provisions their custodial payment account,
// registers them on-chain (register_vendor, signed by the operator's
// custodial key — the invite link implies operator approval), and records the
// membership. Idempotent: re-submitting the same email resumes/returns.

marketplaces.post("/:slug/vendors", async (c) => {
  const slug = c.req.param("slug");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const sells = typeof b.sells === "string" ? b.sells.trim().slice(0, 200) : "";
  if (name.length < 2) return c.json({ error: "Please tell us your name" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ error: "Invalid email address" }, 400);
  }

  const marketplace = await prisma.marketplace.findUnique({
    where: { slug },
    include: { operator: true },
  });
  if (!marketplace || !marketplace.contractMarketplaceId) {
    return c.json({ error: "Marketplace not found" }, 404);
  }
  if (!marketplace.operator.stellarSecretEncrypted) {
    return c.json({ error: "Marketplace is not fully set up" }, 409);
  }

  try {
    // 1. Vendor user + custodial payment account.
    let vendor = await prisma.user.upsert({
      where: { email },
      update: { name },
      create: { email, name, role: "VENDOR" },
    });
    if (!vendor.stellarPublicKey) {
      const account = await createCustodialAccount();
      vendor = await prisma.user.update({
        where: { id: vendor.id },
        data: {
          stellarPublicKey: account.publicKey,
          stellarSecretEncrypted: account.secretEncrypted,
        },
      });
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
        marketplaceId: BigInt(marketplace.contractMarketplaceId),
        vendorPublicKey: vendor.stellarPublicKey as string,
      });
      membership = await prisma.vendorMembership.update({
        where: { id: membership.id },
        data: { registerTxHash: txHash },
      });
    }

    c.header("Set-Cookie", sessionCookieHeader(vendor.id));
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
