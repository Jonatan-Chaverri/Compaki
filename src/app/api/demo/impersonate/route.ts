// GET /api/demo/impersonate?userId=..&redirect=/vendor/slug
// DEMO-ONLY account switcher: Compaki is custodial and passwordless, so the
// presenter can hop between operator and vendor views in one browser.
// A real deployment would replace this with actual authentication.

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { sessionCookieHeader } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  const redirect = request.nextUrl.searchParams.get("redirect") ?? "/";

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  if (!redirect.startsWith("/")) {
    return Response.json({ error: "Invalid redirect" }, { status: 400 });
  }

  const response = NextResponse.redirect(new URL(redirect, request.url));
  response.headers.set("Set-Cookie", sessionCookieHeader(user.id));
  return response;
}
