import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Cloudflare Worker serves this build's output as static assets — no
  // Node server in production. Every route must be statically renderable at
  // build time, which is why ticker pages come from generateStaticParams over
  // the tracked universe rather than being rendered on demand.
  output: "export",

  // The Worker's assets binding serves /t/NVDA/ as /t/NVDA/index.html.
  // Without this, exported links point at /t/NVDA and depend on redirect
  // behaviour we don't control, adding a round trip on every navigation.
  trailingSlash: true,

  // There are two lockfiles (this app's, and the repo root's for the Worker)
  // — without an explicit root, Turbopack guesses which one owns the build
  // and warns about it on every run.
  turbopack: { root: path.join(__dirname) },

  // next/image needs a server to optimise. Static export has none.
  images: { unoptimized: true },

  typescript: {
    // Never ship a build that doesn't typecheck. Explicit because the schema
    // types are generated from the Python Pydantic models — a backend field
    // rename must break the build here, not silently render undefined.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
