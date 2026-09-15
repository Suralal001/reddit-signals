-- Moderator management: standing with each community, the incidents that
-- change it, and the permission requests that earn it.
--
-- Three of Reddit's own rules drive the columns below.
--
-- 1. The ban-evasion filter infers which accounts are related from "how
--    redditors connect to Reddit", and Reddit says outright it "isn't 100%
--    accurate". A team posting from one office is the shape that filter
--    approximates, so a SUB_BAN incident blocks every operator in that
--    community, not only the account that was banned.
-- 2. Vote manipulation explicitly covers coordinated voting on "content from a
--    domain" — so links to the brand domain are budgeted across ALL communities
--    (Settings.brandDomain / domainLinkCap7d), not per subreddit. The domain is
--    the one asset that cannot be replaced.
-- 3. AutoModerator's `remove` action is silent, and a removed comment still
--    renders normally for its author. Reply.publiclyVisible records an
--    unauthenticated read of the same permalink, which is the only honest check.
PRAGMA defer_foreign_keys=ON;

-- ---- Channel standing --------------------------------------------------------
ALTER TABLE "SubredditRule" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE "SubredditRule" ADD COLUMN "rulesUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SubredditRule" ADD COLUMN "verifiedAt" DATETIME;
ALTER TABLE "SubredditRule" ADD COLUMN "verifiedBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SubredditRule" ADD COLUMN "recheckDueAt" DATETIME;
ALTER TABLE "SubredditRule" ADD COLUMN "modHandles" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "SubredditRule" ADD COLUMN "conditions" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SubredditRule" ADD COLUMN "approvedUser" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SubredditRule" ADD COLUMN "requiredFlair" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SubredditRule" ADD COLUMN "promoThread" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SubredditRule" ADD COLUMN "minAccountAgeDays" INTEGER;
ALTER TABLE "SubredditRule" ADD COLUMN "minCommentKarma" INTEGER;
ALTER TABLE "SubredditRule" ADD COLUMN "linksAllowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SubredditRule" ADD COLUMN "mentionCap30d" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "SubredditRule" ADD COLUMN "cooldownUntil" DATETIME;
ALTER TABLE "SubredditRule" ADD COLUMN "cooldownReason" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "SubredditRule_projectId_state_idx" ON "SubredditRule"("projectId", "state");

-- ---- The shared asset --------------------------------------------------------
ALTER TABLE "Settings" ADD COLUMN "brandDomain" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN "domainLinkCap7d" INTEGER NOT NULL DEFAULT 2;

-- ---- Did it actually survive? -----------------------------------------------
ALTER TABLE "Reply" ADD COLUMN "publicCheckedAt" DATETIME;
ALTER TABLE "Reply" ADD COLUMN "publiclyVisible" BOOLEAN;
ALTER TABLE "Reply" ADD COLUMN "gateOverride" TEXT NOT NULL DEFAULT '';

-- ---- Asking permission -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ModOutreach" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "operatorId" TEXT,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT 'DRAFT',
    "draftedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "answeredAt" DATETIME,
    "answer" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ModOutreach_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SubredditRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ModOutreach_projectId_sentAt_idx" ON "ModOutreach"("projectId", "sentAt");
CREATE INDEX IF NOT EXISTS "ModOutreach_ruleId_idx" ON "ModOutreach"("ruleId");

-- ---- What the moderators did to us -------------------------------------------
CREATE TABLE IF NOT EXISTS "ChannelIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'REDDIT',
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "operatorId" TEXT,
    "replyId" TEXT,
    "detail" TEXT NOT NULL DEFAULT '',
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolvedNote" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "ChannelIncident_projectId_channel_at_idx" ON "ChannelIncident"("projectId", "channel", "at");
CREATE INDEX IF NOT EXISTS "ChannelIncident_projectId_kind_at_idx" ON "ChannelIncident"("projectId", "kind", "at");

-- ---- Backfill ----------------------------------------------------------------
-- A rule somebody actually read is READ_ONLY: we know the rules, we have not
-- asked the mods for anything. Everything else stays UNVERIFIED, which blocks
-- brand mentions until a human opens the sidebar.
UPDATE "SubredditRule" SET "state" = 'READ_ONLY' WHERE "verified" = 1;
UPDATE "SubredditRule" SET "verifiedAt" = CURRENT_TIMESTAMP, "verifiedBy" = 'seed' WHERE "verified" = 1;

-- NO_PROMO means the brand name never appears, so the cap is zero rather than
-- two. Stating it makes the channel page readable at a glance.
UPDATE "SubredditRule" SET "mentionCap30d" = 0 WHERE "policy" = 'NO_PROMO';
UPDATE "SubredditRule" SET "mentionCap30d" = 1 WHERE "policy" = 'VALUE_ONLY';

-- The one shared, unreplaceable asset per project.
UPDATE "Settings" SET "brandDomain" = 'usedrydock.com' WHERE "projectId" = 'proj_drydock' AND "brandDomain" = '';
UPDATE "Settings" SET "brandDomain" = 'chordian.ai' WHERE "projectId" = 'proj_chordian' AND "brandDomain" = '';
UPDATE "Settings" SET "brandDomain" = 'theprojectskin.com' WHERE "projectId" = 'proj_projectskin' AND "brandDomain" = '';

-- Communities The Project Skin monitors but must never speak in. Six are full of
-- people under medical care; two are full of minors; three are audiences the
-- brand does not serve. Watch-only is a hard block in the gate, not a preference.
UPDATE "SubredditRule" SET "state" = 'WATCH_ONLY', "mentionCap30d" = 0
WHERE "projectId" = 'proj_projectskin'
  AND "name" IN ('acne','AcneScars','tretinoin','Accutane','Rosacea','PCOS','IndianTeenagers','teenagers','Blackskincare','koreanskincare','TwoXIndia');
