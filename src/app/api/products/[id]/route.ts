// PATCH /api/products/[id] — edit a product (session user must own it).

import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { parseProductInput } from "@/lib/products";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await context.params;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Product not found" }, { status: 404 });
  if (existing.vendorId !== user.id) {
    return Response.json({ error: "Not your product" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = parseProductInput(body);
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const product = await prisma.product.update({ where: { id }, data: input });
  return Response.json({ product });
}
