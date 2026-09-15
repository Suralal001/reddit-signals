import { randomBytes } from "node:crypto";

/**
 * Prisma's @default(cuid()) is applied by the client, not by SQLite, so a row
 * inserted by a plain script has to bring its own id. This is not the cuid2
 * algorithm — it only needs to be collision-free and to look like the other
 * ids, and 96 bits of randomness does that.
 */
export function createId() {
  return `c${Date.now().toString(36)}${randomBytes(12).toString("hex")}`;
}
