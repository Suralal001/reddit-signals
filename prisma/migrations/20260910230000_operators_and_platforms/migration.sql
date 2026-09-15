-- Multi-platform ingestion + named human operators.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- 1. Operators ---------------------------------------------------------------
CREATE TABLE "SubredditOperator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'REDDIT',
    "handle" TEXT NOT NULL,
    "envKey" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dailyCap" INTEGER NOT NULL DEFAULT 3,
    "expertise" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "karma" INTEGER,
    "accountAgeDays" INTEGER,
    "lastCheckedAt" DATETIME,
    "lastPostedAt" DATETIME,
    "healthNote" TEXT NOT NULL DEFAULT '',
    "shadowbanRisk" TEXT NOT NULL DEFAULT 'OK',
    "warmedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubredditOperator_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SubredditOperator_projectId_platform_handle_key" ON "SubredditOperator"("projectId", "platform", "handle");
CREATE INDEX "SubredditOperator_projectId_idx" ON "SubredditOperator"("projectId");

CREATE TABLE "OperatorCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "karma" INTEGER NOT NULL,
    "posted" INTEGER NOT NULL,
    "removed" INTEGER NOT NULL,
    "medianScore" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperatorCheck_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "SubredditOperator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OperatorCheck_operatorId_at_idx" ON "OperatorCheck"("operatorId", "at");

-- 2. Platform columns on Thread and Monitor ----------------------------------
ALTER TABLE "Thread" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'REDDIT';
ALTER TABLE "Monitor" ADD COLUMN "platforms" TEXT NOT NULL DEFAULT '["REDDIT"]';
ALTER TABLE "Monitor" ADD COLUMN "sources" TEXT NOT NULL DEFAULT '{}';

-- 3. Lead.assignedOperatorId --------------------------------------------------
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
    "assignedOperatorId" TEXT,
    "scoredAt" DATETIME,
    "alertedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lead_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lead_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lead_assignedOperatorId_fkey" FOREIGN KEY ("assignedOperatorId") REFERENCES "SubredditOperator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lead" ("id","threadId","monitorId","matchedKeywords","relevance","intentScore","intentReason","sentiment","summary","angle","signal","status","scoredAt","alertedAt","createdAt")
SELECT "id","threadId","monitorId","matchedKeywords","relevance","intentScore","intentReason","sentiment","summary","angle","signal","status","scoredAt","alertedAt","createdAt" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE UNIQUE INDEX "Lead_threadId_monitorId_key" ON "Lead"("threadId", "monitorId");
CREATE INDEX "Lead_status_intentScore_idx" ON "Lead"("status", "intentScore");

-- 4. Reply.operatorId ---------------------------------------------------------
CREATE TABLE "new_Reply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "operatorId" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "redditId" TEXT,
    "permalink" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" DATETIME,
    "score" INTEGER,
    "replyCount" INTEGER,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" DATETIME,
    CONSTRAINT "Reply_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reply_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "SubredditOperator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Reply" ("id","leadId","body","status","redditId","permalink","error","createdAt","postedAt","score","replyCount","removed","checkedAt")
SELECT "id","leadId","body","status","redditId","permalink","error","createdAt","postedAt","score","replyCount","removed","checkedAt" FROM "Reply";
DROP TABLE "Reply";
ALTER TABLE "new_Reply" RENAME TO "Reply";

-- 5. SubredditRule.platform ---------------------------------------------------
CREATE TABLE "new_SubredditRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL DEFAULT 'proj_drydock',
    "platform" TEXT NOT NULL DEFAULT 'REDDIT',
    "name" TEXT NOT NULL,
    "policy" TEXT NOT NULL DEFAULT 'DISCLOSE',
    "notes" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubredditRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT "id","projectId",'REDDIT',"name","policy","notes","verified","updatedAt" FROM "SubredditRule";
DROP TABLE "SubredditRule";
ALTER TABLE "new_SubredditRule" RENAME TO "SubredditRule";
CREATE UNIQUE INDEX "SubredditRule_projectId_platform_name_key" ON "SubredditRule"("projectId", "platform", "name");
CREATE INDEX "SubredditRule_projectId_idx" ON "SubredditRule"("projectId");

-- 6. Seed: channel policies for the non-Reddit platforms, both projects -------
INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_hn', p."id", 'HACKERNEWS', 'news.ycombinator.com', 'DISCLOSE',
  'HN guidelines allow mentioning your own work when it is genuinely relevant, but you must disclose it. Astroturfing and voting rings are detected and punished with a site-wide domain ban. Never post from more than one account.', 1, CURRENT_TIMESTAMP
FROM "Project" p;

INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_ph', p."id", 'PRODUCTHUNT', 'producthunt.com', 'DISCLOSE',
  'Makers are expected to identify themselves. Comment manipulation (coordinated upvotes or comments) is grounds for removal of the launch.', 0, CURRENT_TIMESTAMP
FROM "Project" p;

INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_gh', p."id", 'GITHUB', 'github.com', 'VALUE_ONLY',
  'Answer the issue or discussion on its technical merits. Mention the product only if a maintainer or the author explicitly asks for alternatives, and disclose affiliation when you do.', 0, CURRENT_TIMESTAMP
FROM "Project" p;

INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_so', p."id", 'STACKOVERFLOW', 'stackoverflow.com', 'VALUE_ONLY',
  'Stack Overflow requires explicit disclosure of affiliation in any answer that mentions your product, and answers that are mostly promotion are deleted. Answer the question completely first.', 1, CURRENT_TIMESTAMP
FROM "Project" p;

PRAGMA foreign_keys=ON;
