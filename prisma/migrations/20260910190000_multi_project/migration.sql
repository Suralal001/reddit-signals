-- Multi-project support: Project model, per-project Settings, Monitor.projectId.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Projects -------------------------------------------------------------------
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

INSERT INTO "Project" ("id", "name", "slug") VALUES ('proj_drydock', 'DryDock AI', 'drydock');
INSERT INTO "Project" ("id", "name", "slug") VALUES ('proj_chordian', 'Chordian AI', 'chordian');

-- Monitor: add projectId ------------------------------------------------------
CREATE TABLE "new_Monitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL DEFAULT 'proj_drydock',
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LEAD',
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "subreddits" TEXT NOT NULL DEFAULT '[]',
    "scanComments" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Monitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Monitor" ("id", "projectId", "name", "kind", "keywords", "subreddits", "scanComments", "active", "createdAt")
SELECT "id", 'proj_drydock', "name", "kind", "keywords", "subreddits", "scanComments", "active", "createdAt" FROM "Monitor";
DROP TABLE "Monitor";
ALTER TABLE "new_Monitor" RENAME TO "Monitor";
CREATE INDEX "Monitor_projectId_idx" ON "Monitor"("projectId");

-- Backfill: monitors created for Chordian move to the Chordian project.
UPDATE "Monitor" SET "projectId" = 'proj_chordian'
WHERE "name" LIKE 'Chordian%'
   OR "name" IN ('Agent memory pain — leads', 'Memory tool requests — high intent', 'Private & sovereign AI — leads');

-- Settings: single row -> one row per project ---------------------------------
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL DEFAULT '',
    "productDesc" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL DEFAULT '',
    "voice" TEXT NOT NULL DEFAULT '',
    "competitors" TEXT NOT NULL DEFAULT '[]',
    "alertThreshold" INTEGER NOT NULL DEFAULT 70,
    "slackWebhook" TEXT NOT NULL DEFAULT '',
    "lookbackDays" INTEGER NOT NULL DEFAULT 3,
    "dailyReplyCap" INTEGER NOT NULL DEFAULT 5,
    "playbook" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Settings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Settings" ("id", "projectId", "brandName", "productDesc", "audience", "voice", "competitors", "alertThreshold", "slackWebhook", "lookbackDays", "dailyReplyCap", "playbook", "updatedAt")
SELECT 'set_drydock', 'proj_drydock', "brandName", "productDesc", "audience", "voice", "competitors", "alertThreshold", "slackWebhook", "lookbackDays", "dailyReplyCap", "playbook", "updatedAt"
FROM "Settings" WHERE "id" = 1;
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE UNIQUE INDEX "Settings_projectId_key" ON "Settings"("projectId");

-- Chordian settings, prefilled from GTM research.
INSERT INTO "Settings" ("id", "projectId", "brandName", "productDesc", "audience", "voice", "competitors", "playbook", "updatedAt")
VALUES (
  'set_chordian',
  'proj_chordian',
  'Chordian AI',
  'Institutional memory and AI search infrastructure (chordian.ai). Chordian Memory ingests from 350+ connectors and keeps an entity-coherent, bi-temporal memory of the organisation; Chordian Search is an agentic search layer with cited answers. MCP-native (works with Claude, Cursor, ChatGPT in ~30s). Deploys as managed cloud, BYOC in the customer VPC, or fully air-gapped on-prem. No training on customer data; GDPR compliant, HIPAA-ready. It replaces per-agent memory silos (Mem0/Zep/Letta-style) and adds what vector-DB RAG pipelines miss: entity resolution and time-versioned facts.',
  'AI engineers, agent builders and platform teams (bottom-up via MCP); executive search, consulting and legal/regulated enterprises, CTOs/CISOs (top-down). Buyers care about knowledge loss, data sovereignty and agent memory that the organisation owns.',
  '',
  '["Mem0","Zep","Letta","Supermemory","Cognee","LangMem","Glean","Langdock","Dust","Credal"]',
  '{}',
  CURRENT_TIMESTAMP
);

PRAGMA foreign_keys=ON;
