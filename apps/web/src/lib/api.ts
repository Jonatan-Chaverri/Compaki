// Server-side helper for calling the Compaki API from server components,
// forwarding the browser's session cookie. Client components don't need it —
// they fetch("/api/...") and the Next.js rewrite proxies to the API app.

import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function apiFetch(path: string): Promise<Response> {
  const store = await cookies();
  return fetch(`${API_URL}${path}`, {
    headers: { cookie: store.toString() },
    cache: "no-store",
  });
}
