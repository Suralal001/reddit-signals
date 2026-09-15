#!/usr/bin/env node
/**
 * Creates the first admin from ADMIN_EMAIL, and only when the user table is
 * empty. It never touches an existing account, so leaving ADMIN_EMAIL set in
 * the environment forever is harmless — it will not resurrect an account an
 * admin deliberately disabled, or reset anybody's password on restart.
 */
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createId } from "./lib/cuid.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const email = (process.argv[2] || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
if (!email) process.exit(0);

const raw = process.env.DATABASE_URL || "file:./dev.db";
const db = new Database(path.resolve(root, raw.replace(/^file:/, "")));
db.pragma("busy_timeout = 5000");

const count = db.prepare('SELECT COUNT(*) AS n FROM "User"').get().n;
if (count > 0) {
  db.close();
  process.exit(0);
}

const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url");
const salt = randomBytes(16);
const hash = `scrypt$${salt.toString("base64url")}$${scryptSync(password.normalize("NFKC"), salt, 64).toString("base64url")}`;

db.prepare(
  'INSERT INTO "User" (id, email, name, passwordHash, role, disabled, mustChange, createdAt) VALUES (?,?,?,?,?,0,?,CURRENT_TIMESTAMP)',
).run(createId(), email, process.env.ADMIN_NAME || "", hash, "ADMIN", process.env.ADMIN_PASSWORD ? 0 : 1);

console.log(`[boot] created the first admin: ${email}`);
if (!process.env.ADMIN_PASSWORD) {
  console.log(`[boot] temporary password: ${password}`);
  console.log("[boot] it is printed here once. Sign in, change it, and it is gone from the logs on the next deploy.");
}
db.close();
