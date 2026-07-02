// GET /api/balance?account=G... — real on-chain demo-USDC balance of an
// account. Public keys are public information; this is a read-only testnet
// lookup used by the dashboards' live-balance widgets.

import { Hono } from "hono";

import { getUsdBalance } from "@/lib/stellar";

export const balance = new Hono();

balance.get("/", async (c) => {
  const account = c.req.query("account") ?? "";
  if (!/^G[A-Z2-7]{55}$/.test(account)) {
    return c.json({ error: "Invalid account" }, 400);
  }
  try {
    const balanceUsd = await getUsdBalance(account);
    return c.json({ balanceUsd });
  } catch (error) {
    console.error("[balance] lookup failed:", error);
    return c.json({ error: "Balance lookup failed" }, 502);
  }
});
