#!/usr/bin/env node
/**
 * Applies prisma/migrations/<name>/migration.sql in order, skipping any already
 * recorded in _prisma_migrations, and writes the bookkeeping row itself.
 *
 * Why not `prisma migrate deploy`? Because that pulls a schema-engine binary
 * from binaries.prisma.sh at runtime. Making a container's ability to start
 * depend on a third-party download — inside whatever egress policy the host
 * has — is a bad trade for a step that is, for SQLite, "run these files in
 * order and remember which ones you ran". The format of _prisma_migrations is
 * unchanged, so `prisma migrate` on a developer machine still agrees with it.
 *
 *   node scripts/migrate.mjs [path/to/db]
 */
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(root, "prisma", "migrations");

function dbPath() {
  const fromArg = process.argv[2];
  if (fromArg) return path.resolve(fromArg);
  const raw = process.env.DATABASE_URL || "file:./dev.db";
  return path.resolve(root, raw.replace(/^file:/, ""));
}

const file = dbPath();
mkdirSync(path.dirname(file), { recursive: true });
const db = new Database(file);

// WAL lets the poller read while a request writes, and survives an unclean
// container stop far better than the rollback journal.
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
  );
`);

const applied = new Set(
  db.prepare('SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL').all().map((r) => r.migration_name),
);

const pending = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
  .filter((name) => !applied.has(name));

if (pending.length === 0) {
  console.log(`[migrate] up to date (${applied.size} applied) · ${file}`);
  process.exit(0);
}

const record = db.prepare(
  `INSERT INTO "_prisma_migrations"
     (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
   VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`,
);

for (const name of pending) {
  const sqlPath = path.join(MIGRATIONS, name, "migration.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const startedAt = new Date().toISOString();
  process.stdout.write(`[migrate] ${name} … `);
  try {
    // Each migration is one transaction. Several of these use SQLite's
    // table-rebuild pattern with foreign keys deferred, which only works if the
    // whole rebuild lands or none of it does.
    db.exec("BEGIN");
    db.exec(sql);
    record.run(randomUUID(), createHash("sha256").update(sql).digest("hex"), new Date().toISOString(), name, startedAt);
    db.exec("COMMIT");
    console.log("ok");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    console.error(`failed\n[migrate] ${name}: ${err.message}`);
    process.exit(1);
  }
}

console.log(`[migrate] applied ${pending.length} migration${pending.length === 1 ? "" : "s"} · ${file}`);
db.close();
