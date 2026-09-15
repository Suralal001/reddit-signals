#!/usr/bin/env node
/**
 * Creates or updates a login account, straight against SQLite so it works
 * before the app has ever started and inside a container with nothing else
 * installed.
 *
 *   node scripts/create-user.mjs you@example.com "Your Name" --admin
 *   node scripts/create-user.mjs you@example.com --password 'correct horse battery staple'
 *
 * With no --password a strong one is generated and printed once. The hash is
 * scrypt, the same as the app's, so the two always agree.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { createId } from "./lib/cuid.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--"));
const pwIndex = argv.indexOf("--password");
const givenPassword = pwIndex >= 0 ? argv[pwIndex + 1] : null;

const email = (positional[0] || "").trim().toLowerCase();
const name = pwIndex >= 0 && positional[1] === givenPassword ? "" : (positional[1] || "").trim();

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: node scripts/create-user.mjs <email> ["Full Name"] [--admin] [--password "…"]');
  process.exit(1);
}

const password = givenPassword || randomBytes(12).toString("base64url");
if (password.length < 12) {
  console.error("A password under 12 characters is not worth the login form around it.");
  process.exit(1);
}

function hash(pw) {
  const salt = randomBytes(16);
  const h = scryptSync(pw.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("base64url")}$${h.toString("base64url")}`;
}

const raw = process.env.DATABASE_URL || "file:./dev.db";
const db = new Database(path.resolve(root, raw.replace(/^file:/, "")));
db.pragma("busy_timeout = 5000");

const existing = db.prepare('SELECT id FROM "User" WHERE email = ?').get(email);
const role = flags.has("--admin") ? "ADMIN" : "MEMBER";
// A generated password must be changed on first sign-in; one the operator chose
// deliberately should not nag them.
const mustChange = givenPassword ? 0 : 1;

if (existing) {
  db.prepare('UPDATE "User" SET passwordHash = ?, role = ?, disabled = 0, mustChange = ? WHERE id = ?')
    .run(hash(password), role, mustChange, existing.id);
  db.prepare('DELETE FROM "Session" WHERE userId = ?').run(existing.id);
  console.log(`Updated ${email} (${role}). Existing sessions were signed out.`);
} else {
  db.prepare(
    'INSERT INTO "User" (id, email, name, passwordHash, role, disabled, mustChange, createdAt) VALUES (?,?,?,?,?,0,?,CURRENT_TIMESTAMP)',
  ).run(createId(), email, name, hash(password), role, mustChange);
  console.log(`Created ${email} (${role}).`);
}

if (!givenPassword) {
  console.log(`\n  Temporary password: ${password}\n`);
  console.log("Hand it over directly. It is not stored anywhere and will not be shown again.");
}
db.close();
