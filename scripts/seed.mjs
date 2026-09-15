#!/usr/bin/env node
/**
 * Tops the workspace up from prisma/seed.json, which the build froze out of
 * PROJECT_DEFAULTS.
 *
 * It runs on every boot, so it is written to add what is missing and never to
 * overwrite what is there: channel rules are INSERT OR IGNORE, settings are
 * only written into empty fields, and monitors are seeded only when there are
 * none at all. The migrations already create DryDock's monitors, so on a normal
 * deployment this fills in the channel rules they do not cover and otherwise
 * stands down.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createId } from "./lib/cuid.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedFile = path.join(root, "prisma", "seed.json");
if (!existsSync(seedFile)) {
  console.log("[seed] no prisma/seed.json — nothing to seed");
  process.exit(0);
}

const raw = process.env.DATABASE_URL || "file:./dev.db";
const db = new Database(path.resolve(root, raw.replace(/^file:/, "")));
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

const projects = JSON.parse(readFileSync(seedFile, "utf8"));
const now = () => new Date().toISOString();

const insert = db.transaction(() => {
  for (const p of projects) {
    db.prepare('INSERT OR IGNORE INTO "Project" (id, name, slug, createdAt) VALUES (?,?,?,?)').run(
      p.id,
      p.name,
      p.slug,
      now(),
    );

    const s = p.settings;
    const existing = db.prepare('SELECT * FROM "Settings" WHERE projectId = ?').get(p.id);
    if (!existing) {
      db.prepare(
        `INSERT INTO "Settings"
           (id, projectId, brandName, productDesc, audience, voice, competitors, brandDomain, playbook, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        createId(),
        p.id,
        s.brandName,
        s.productDesc,
        s.audience,
        s.voice,
        JSON.stringify(s.competitors),
        s.brandDomain ?? "",
        JSON.stringify(s.playbook),
        now(),
      );
    } else {
      // Fill the blanks only. Anything somebody has typed stays typed.
      const fill = {
        brandName: existing.brandName || s.brandName,
        productDesc: existing.productDesc || s.productDesc,
        audience: existing.audience || s.audience,
        voice: existing.voice || s.voice,
        competitors: existing.competitors && existing.competitors !== "[]" ? existing.competitors : JSON.stringify(s.competitors),
        brandDomain: existing.brandDomain || s.brandDomain || "",
        playbook: existing.playbook && existing.playbook !== "{}" ? existing.playbook : JSON.stringify(s.playbook),
      };
      db.prepare(
        'UPDATE "Settings" SET brandName=?, productDesc=?, audience=?, voice=?, competitors=?, brandDomain=?, playbook=?, updatedAt=? WHERE projectId=?',
      ).run(fill.brandName, fill.productDesc, fill.audience, fill.voice, fill.competitors, fill.brandDomain, fill.playbook, now(), p.id);
    }

    let newRules = 0;
    for (const r of p.subredditRules) {
      const res = db
        .prepare(
          `INSERT OR IGNORE INTO "SubredditRule"
             (id, projectId, platform, name, policy, notes, verified, state, updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          createId(),
          p.id,
          "REDDIT",
          r.name,
          r.policy,
          r.notes,
          r.verified ? 1 : 0,
          r.verified ? "READ_ONLY" : "UNVERIFIED",
          now(),
        );
      newRules += res.changes;
    }

    const haveMonitors = db.prepare('SELECT COUNT(*) AS n FROM "Monitor" WHERE projectId = ?').get(p.id).n;
    let newMonitors = 0;
    if (haveMonitors === 0) {
      for (const m of p.monitors) {
        db.prepare(
          `INSERT INTO "Monitor" (id, projectId, name, kind, keywords, subreddits, platforms, sources, scanComments, active, createdAt)
           VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
        ).run(
          createId(),
          p.id,
          m.name,
          m.kind,
          JSON.stringify(m.keywords),
          JSON.stringify(m.subreddits),
          JSON.stringify(m.platforms ?? ["REDDIT"]),
          JSON.stringify(m.sources ?? {}),
          m.scanComments ? 1 : 0,
          now(),
        );
        newMonitors++;
      }
    }

    console.log(
      `[seed] ${p.name}: +${newMonitors} monitors (${haveMonitors} already there), +${newRules} channel rules`,
    );
  }
});

insert();
db.close();
