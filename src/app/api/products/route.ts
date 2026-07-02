// POST /api/products — create a product (session user must be a registered
// vendor of the marketplace).

import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { parseProductInput } from "@/lib/products";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const slug = typeof b.marketplaceSlug === "string" ? b.marketplaceSlug : "";
  const input = parseProductInput(body);
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const marketplace = await prisma.marketplace.findUnique({ where: { slug } });
  if (!marketplace) return Response.json({ error: "Marketplace not found" }, { status: 404 });

  const membership = await prisma.vendorMembership.findUnique({
    where: { marketplaceId_userId: { marketplaceId: marketplace.id, userId: user.id } },
  });
  if (!membership) {
    return Response.json({ error: "You are not a vendor of this marketplace" }, { status: 403 });
  }

  const product = await prisma.product.create({
    data: {
      ...input,
      marketplaceId: marketplace.id,
      vendorId: user.id,
    },
  });
  return Response.json({ product }, { status: 201 });
}
