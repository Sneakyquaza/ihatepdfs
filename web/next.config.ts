import type { NextConfig } from "next";

// Backend (FastAPI) origin. Requests to /api/* are proxied there so the browser stays same-origin.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
