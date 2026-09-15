-- Apify actors: a configurable bridge to sources the built-in adapters can't reach.
CREATE TABLE "ApifyActor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT '',
    "input" TEXT NOT NULL DEFAULT '{}',
    "mapping" TEXT NOT NULL DEFAULT '{}',
    "cadenceHours" INTEGER NOT NULL DEFAULT 24,
    "maxRunsPerDay" INTEGER NOT NULL DEFAULT 2,
    "maxItems" INTEGER NOT NULL DEFAULT 100,
    "timeoutSecs" INTEGER NOT NULL DEFAULT 120,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "lastItems" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "runsToday" INTEGER NOT NULL DEFAULT 0,
    "runDate" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApifyActor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ApifyActor_projectId_name_key" ON "ApifyActor"("projectId", "name");
CREATE INDEX "ApifyActor_projectId_idx" ON "ApifyActor"("projectId");

-- Channel policies for the sources Apify typically reaches.
INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_x', p."id", 'APIFY', 'x.com', 'DISCLOSE',
  'Replying happens in the browser from a real named account. Disclose affiliation in the reply itself — a bio nobody clicks is not a disclosure.', 0, CURRENT_TIMESTAMP
FROM "Project" p;

INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_g2', p."id", 'APIFY', 'g2.com', 'NO_PROMO',
  'Research only. Never comment on a review as a vendor from a personal account — G2 has an official vendor response flow and using anything else reads as astroturfing. Use these to find who is unhappy with a competitor and why, then meet them somewhere you can actually talk.', 1, CURRENT_TIMESTAMP
FROM "Project" p;

INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_capterra', p."id", 'APIFY', 'capterra.com', 'NO_PROMO',
  'Research only, same as G2. Vendor responses go through Capterra''s own flow.', 1, CURRENT_TIMESTAMP
FROM "Project" p;

INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_yt', p."id", 'APIFY', 'youtube.com', 'DISCLOSE',
  'Comment sections under competitor demos are fair game if you answer the actual question. Disclose, and never lead with the product.', 0, CURRENT_TIMESTAMP
FROM "Project" p;

INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_web', p."id", 'APIFY', 'web', 'NO_PROMO',
  'Search results and news articles are intelligence, not a thread. Nothing here gets replied to from Sonar.', 1, CURRENT_TIMESTAMP
FROM "Project" p;
