import type { NextConfig } from "next";

// Backend (FastAPI) origin. Requests to /api/* are proxied there so the browser stays same-origin.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

// Static pages can't carry per-request nonces, so inline scripts (Next bootstrap) need 'unsafe-inline'.
// 'wasm-unsafe-eval' + blob: scripts/workers are required by the in-browser AI (onnxruntime-web).
const csp = (scriptExtra = "") => [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:${scriptExtra}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: csp() },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // background-removal chunks are content-addressed (named by sha256): cache forever
      { source: "/bg-model/:file([0-9a-f]{64})", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // the background-removal model runtime (protobufjs) compiles code with new Function: allow eval on that page only
      { source: "/:locale/remove-bg", headers: [{ key: "Content-Security-Policy", value: csp(" 'unsafe-eval'") }] },
    ];
  },
};

export default nextConfig;
