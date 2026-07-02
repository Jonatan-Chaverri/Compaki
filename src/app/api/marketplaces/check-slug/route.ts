import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isValidSlug } from "@/lib/slug";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  if (!isValidSlug(slug)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }
  const existing = await prisma.marketplace.findUnique({
    where: { slug },
    select: { id: true },
  });
  return NextResponse.json({
    available: existing === null,
    reason: existing ? "taken" : null,
  });
}
