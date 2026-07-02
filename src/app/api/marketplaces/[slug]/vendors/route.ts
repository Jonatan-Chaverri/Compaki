// POST /api/marketplaces/[slug]/vendors — vendor registration.
// Creates/reuses the vendor user, provisions their custodial payment account,
// registers them on-chain (register_vendor, signed by the operator's
// custodial key — the invite link implies operator approval), and records the
// membership. Idempotent: re-submitting the same email resumes/returns.

import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { sessionCookieHeader } from "@/lib/session";
import { createCustodialAccount, decryptSecret, registerVendor } from "@/lib/stellar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const sells = typeof b.sells === "string" ? b.sells.trim().slice(0, 200) : "";
  if (name.length < 2) return Response.json({ error: "Please tell us your name" }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "Invalid email address" }, { status: 400 });
  }

  const marketplace = await prisma.marketplace.findUnique({
    where: { slug },
    include: { operator: true },
  });
  if (!marketplace || !marketplace.contractMarketplaceId) {
    return Response.json({ error: "Marketplace not found" }, { status: 404 });
  }
  if (!marketplace.operator.stellarSecretEncrypted) {
    return Response.json({ error: "Marketplace is not fully set up" }, { status: 409 });
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

    return Response.json(
      {
        vendor: { id: vendor.id, name: vendor.name },
        marketplace: { name: marketplace.name, slug: marketplace.slug },
        vendorDashboardPath: `/vendor/${marketplace.slug}`,
        registerTxHash: membership.registerTxHash,
      },
      { headers: { "Set-Cookie": sessionCookieHeader(vendor.id) } },
    );
  } catch (error) {
    console.error("[vendor-registration] failed:", error);
    return Response.json(
      { error: "Could not finish your registration. Please try again." },
      { status: 500 },
    );
  }
}
