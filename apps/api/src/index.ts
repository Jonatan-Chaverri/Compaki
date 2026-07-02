import "./env";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";

import { balance } from "./routes/balance";
import { demo } from "./routes/demo";
import { marketplaces } from "./routes/marketplaces";
import { me } from "./routes/me";
import { products } from "./routes/products";

// All routes live under /api so the web app can proxy /api/* here verbatim.
// Cookies and SSE flow through that same-origin proxy, so no CORS is needed.
const app = new Hono();

app.use(logger());

app.route("/api/balance", balance);
app.route("/api/demo", demo);
app.route("/api/marketplaces", marketplaces);
app.route("/api/me", me);
app.route("/api/products", products);

app.get("/health", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Compaki API listening on http://localhost:${info.port}`);
});
