-- People and accounts: one row per human, across every platform they post on.
-- Built only from what people published themselves — handle, display name,
-- public profile link. Cross-platform links are suggested, never auto-merged.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- 1. Accounts ----------------------------------------------------------------
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT '',
    "segment" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Account_projectId_name_key" ON "Account"("projectId", "name");
CREATE INDEX "Account_projectId_idx" ON "Account"("projectId");

-- 2. People ------------------------------------------------------------------
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "accountId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'SEEN',
    "notes" TEXT NOT NULL DEFAULT '',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Person_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Person_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Person_projectId_idx" ON "Person"("projectId");
CREATE INDEX "Person_projectId_stage_idx" ON "Person"("projectId", "stage");

-- 3. Platform handles ---------------------------------------------------------
CREATE TABLE "PersonHandle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL DEFAULT '',
    "confidence" TEXT NOT NULL DEFAULT 'OBSERVED',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonHandle_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonHandle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PersonHandle_projectId_platform_handle_key" ON "PersonHandle"("projectId", "platform", "handle");
CREATE INDEX "PersonHandle_personId_idx" ON "PersonHandle"("personId");

-- 4. Lead.personId ------------------------------------------------------------
CREATE TABLE "new_Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "matchedKeywords" TEXT NOT NULL DEFAULT '[]',
    "relevance" INTEGER,
    "intentScore" INTEGER,
    "intentReason" TEXT,
    "sentiment" TEXT,
    "summary" TEXT,
    "angle" TEXT,
    "signal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "personId" TEXT,
    "assignedOperatorId" TEXT,
    "scoredAt" DATETIME,
    "alertedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lead_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lead_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lead_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_assignedOperatorId_fkey" FOREIGN KEY ("assignedOperatorId") REFERENCES "SubredditOperator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lead" ("id","threadId","monitorId","matchedKeywords","relevance","intentScore","intentReason","sentiment","summary","angle","signal","status","assignedOperatorId","scoredAt","alertedAt","createdAt")
SELECT "id","threadId","monitorId","matchedKeywords","relevance","intentScore","intentReason","sentiment","summary","angle","signal","status","assignedOperatorId","scoredAt","alertedAt","createdAt" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE UNIQUE INDEX "Lead_threadId_monitorId_key" ON "Lead"("threadId", "monitorId");
CREATE INDEX "Lead_status_intentScore_idx" ON "Lead"("status", "intentScore");
CREATE INDEX "Lead_personId_idx" ON "Lead"("personId");

-- 5. Backfill: one person per (project, platform, author) already on file -----
-- Handles first, carrying a generated person id, so the aggregate only has to
-- be computed once. Deleted and system authors are skipped: there is no human
-- behind "[deleted]" or "LinkedIn Sales Navigator".
INSERT INTO "PersonHandle" ("id","personId","projectId","platform","handle","profileUrl","confidence","firstSeenAt","lastSeenAt")
SELECT
    'ph_' || lower(hex(randomblob(10))),
    'per_' || lower(hex(randomblob(10))),
    x."projectId", x."platform", x."author", '', 'OBSERVED', x."firstSeen", x."lastSeen"
FROM (
    SELECT m."projectId" AS "projectId",
           t."platform"  AS "platform",
           t."author"    AS "author",
           MIN(t."createdUtc") AS "firstSeen",
           MAX(t."createdUtc") AS "lastSeen"
    FROM "Lead" l
    JOIN "Thread"  t ON t."id" = l."threadId"
    JOIN "Monitor" m ON m."id" = l."monitorId"
    WHERE trim(t."author") <> ''
      AND t."author" NOT IN ('[deleted]', '[removed]', 'unknown', 'AutoModerator',
                             'LinkedIn', 'LinkedIn member', 'LinkedIn Sales Navigator', 'producthunt')
    GROUP BY m."projectId", t."platform", t."author"
) x;

INSERT INTO "Person" ("id","projectId","displayName","stage","firstSeenAt","lastSeenAt")
SELECT h."personId", h."projectId", h."handle", 'SEEN', h."firstSeenAt", h."lastSeenAt"
FROM "PersonHandle" h;

UPDATE "Lead" SET "personId" = (
    SELECT h."personId"
    FROM "PersonHandle" h
    JOIN "Thread"  t ON t."id" = "Lead"."threadId"
    JOIN "Monitor" m ON m."id" = "Lead"."monitorId"
    WHERE h."projectId" = m."projectId"
      AND h."platform"  = t."platform"
      AND h."handle"    = t."author"
);

-- Anyone we already replied to is past "seen".
UPDATE "Person" SET "stage" = 'ENGAGED'
WHERE "id" IN (
    SELECT l."personId" FROM "Lead" l
    JOIN "Reply" r ON r."leadId" = l."id"
    WHERE r."status" = 'POSTED' AND l."personId" IS NOT NULL
);

PRAGMA foreign_keys=ON;
