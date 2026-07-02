import type { NextConfig } from "next";

// All /api traffic proxies to the standalone API app (apps/api), so browser
// calls stay same-origin — cookies and SSE flow through without CORS setup.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
