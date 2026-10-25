import "./env";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";

import { startCommunityScheduler } from "./lib/distribution";

import { auth } from "./routes/auth";
import { balance } from "./routes/balance";
import { demo } from "./routes/demo";
import { marketplaces } from "./routes/marketplaces";
import { me } from "./routes/me";
import { orders } from "./routes/orders";
import { products } from "./routes/products";
import { rewards } from "./routes/rewards";
import { sales } from "./routes/sales";
import { stellarToml } from "./routes/stellar-toml";
import { tx } from "./routes/tx";
import { wallet } from "./routes/wallet";

// All routes live under /api so the web app can proxy /api/* here verbatim.
// Cookies and SSE flow through that same-origin proxy, so no CORS is needed.
const app = new Hono();

app.use(logger());

app.route("/api/auth", auth);
app.route("/api/balance", balance);
app.route("/api/demo", demo);
app.route("/api/marketplaces", marketplaces);
app.route("/api/me", me);
app.route("/api/orders", orders);
app.route("/api/products", products);
app.route("/api/rewards", rewards);
app.route("/api/sales", sales);
app.route("/api/tx", tx);
app.route("/api/wallet", wallet);

app.route("/.well-known", stellarToml);
app.get("/health", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Compaki API listening on http://localhost:${info.port}`);
});

// Distributes rewards periods the moment they are due (and catches any
// fundraising round left unreleased). See src/lib/distribution.ts.
startCommunityScheduler();
