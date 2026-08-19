import type { NextConfig } from "next";
import { resolve } from "node:path";

// Keep this typed mirror aligned with the effective next.config.js. Restricting
// page extensions keeps any retained placeholder .js pages ineligible.
const config: NextConfig = {
  pageExtensions: ["tsx", "ts"],
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingRoot: resolve(process.cwd()),
  serverExternalPackages: ["undici", "@earendil-works/pi-coding-agent", "@earendil-works/pi-agent-core", "@earendil-works/pi-ai", "@earendil-works/pi-tui"],
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*"],
  env: { NEXT_PUBLIC_APP_VERSION: "0.2.9", NEXT_PUBLIC_PI_VERSION: "0.84.2" },
  webpack(webpackConfig) {
    // NodeNext sources import compiled ".js" specifiers; webpack must map them
    // back to the TypeScript originals inside this repository-only boundary.
    webpackConfig.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return webpackConfig;
  },
  async headers() { return [
    {
      source: "/:path*",
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      ],
    },
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
    {
      source: "/manifest.webmanifest",
      headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
    },
  ]; },
};
export default config;
