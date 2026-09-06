import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
