// GET /api/balance?account=G... — real on-chain demo-USDC balance of an
// account. Public keys are public information; this is a read-only testnet
// lookup used by the dashboards' live-balance widgets.

import { NextRequest } from "next/server";

import { getUsdBalance } from "@/lib/stellar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get("account") ?? "";
  if (!/^G[A-Z2-7]{55}$/.test(account)) {
    return Response.json({ error: "Invalid account" }, { status: 400 });
  }
  try {
    const balanceUsd = await getUsdBalance(account);
    return Response.json({ balanceUsd });
  } catch (error) {
    console.error("[balance] lookup failed:", error);
    return Response.json({ error: "Balance lookup failed" }, { status: 502 });
  }
}
