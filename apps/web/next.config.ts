import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // Monorepo: pin the file-tracing root to the repo root so Next stops
  // guessing from nested lockfiles (silences the workspace-root warning).
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default nextConfig;
