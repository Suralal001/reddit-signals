import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native SQLite driver + Prisma must not be bundled by Turbopack/webpack.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-better-sqlite3", "better-sqlite3"],
  // Emit .next/standalone so the runtime image carries only what the server
  // actually imports — no build toolchain, no Prisma CLI, no TypeScript.
  output: "standalone",
};

export default nextConfig;
