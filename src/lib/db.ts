import "dotenv/config";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma singleton. Next.js hot-reloads modules in dev, so we stash the
 * client on globalThis to avoid opening a new SQLite handle every reload.
 *
 * To move to Postgres later: swap the adapter for @prisma/adapter-pg and
 * change `provider` in prisma/schema.prisma.
 */
function createClient() {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  const file = raw.replace(/^file:/, "");
  const url = `file:${path.resolve(/* turbopackIgnore: true */ process.cwd(), file)}`;
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
