-- Risk sign-off on Apify actors, plus the X and LinkedIn configurations.
--
-- The blanket LinkedIn block is replaced by a sharper pair of rules (actorRisk
-- in src/lib/sources/apify.ts): people-harvesting actors are refused outright
-- on any platform, and LinkedIn content search runs only with a recorded
-- acknowledgement. Contact-data scrubbing stays unconditional.
PRAGMA defer_foreign_keys=ON;

ALTER TABLE "ApifyActor" ADD COLUMN "riskAccepted" BOOLEAN NOT NULL DEFAULT false;

-- Cadence is per actor, so each actor gets its own monitor: if two monitors
-- point at one actor, only the first one's keywords are ever used.
UPDATE "ApifyActor" SET "input" = '{
  "searchTerms": {{keywords}},
  "maxItems": {{limit}},
  "sort": "Latest",
  "start": "{{sinceDate}}",
  "tweetLanguage": "en"
}', "mapping" = '{
  "id": "id|url",
  "title": "text",
  "body": "text|full_text",
  "author": "author/userName|author/name|username",
  "url": "url|twitterUrl",
  "createdAt": "createdAt|created_at",
  "score": "likeCount|favorite_count",
  "numComments": "replyCount|reply_count"
}', "cadenceHours" = 12, "maxRunsPerDay" = 2,
    "maxItems" = 100, "timeoutSecs" = 150, "channel" = 'x.com'
WHERE "projectId" = 'proj_drydock' AND "name" = 'X/Twitter — DryDock signals';

INSERT INTO "ApifyActor" ("id","projectId","name","actorId","channel","input","mapping","cadenceHours","maxRunsPerDay","maxItems","timeoutSecs","active","riskAccepted","createdAt")
SELECT 'apa_' || lower(hex(randomblob(8))), 'proj_drydock', 'LinkedIn posts — DryDock signals', 'PASTE_ACTOR_ID', 'linkedin.com',
  '{
  "searchQueries": {{keywords}},
  "maxItems": {{limit}},
  "datePosted": "past-week",
  "sortBy": "date"
}', '{
  "id": "urn|postUrl|url",
  "title": "text|postContent",
  "body": "text|postContent|content",
  "author": "authorName|author/name|authorHeadline",
  "url": "postUrl|url|link",
  "createdAt": "postedAt|publishedAt|date|postedAtISO",
  "score": "numLikes|likesCount|reactions",
  "numComments": "numComments|commentsCount"
}', 24, 1, 60, 180, 0, 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ApifyActor" WHERE "projectId" = 'proj_drydock' AND "name" = 'LinkedIn posts — DryDock signals');

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_drydock', 'Apify — X/Twitter signals', 'LEAD', '[]', '[]', '["APIFY"]', '{}', 0, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_drydock' AND "name" = 'Apify — X/Twitter signals');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["AI code review", "AI generated code", "code review bottleneck", "Copilot ROI", "AI coding cost", "AI governance", "agent PR review", "AI code quality", "shipping AI code", "AI productivity paradox", "engineering intelligence", "DORA metrics"]', "subreddits" = '[]',
    "platforms" = '["APIFY"]', "sources" = '{"APIFY": ["X/Twitter \u2014 DryDock signals"]}', "scanComments" = 0, "active" = 1
WHERE "projectId" = 'proj_drydock' AND "name" = 'Apify — X/Twitter signals';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_drydock', 'Apify — LinkedIn signals', 'LEAD', '[]', '[]', '["APIFY"]', '{}', 0, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_drydock' AND "name" = 'Apify — LinkedIn signals');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["AI code review bottleneck", "AI generated code quality", "AI governance engineering", "AI delivery governance", "governing AI code", "AI code risk", "AI assisted code production", "shipping AI code", "AI code accountability", "Copilot ROI", "Copilot billing", "AI coding tools cost", "AI spend engineering"]', "subreddits" = '[]',
    "platforms" = '["APIFY"]', "sources" = '{"APIFY": ["LinkedIn posts \u2014 DryDock signals"]}', "scanComments" = 0, "active" = 1
WHERE "projectId" = 'proj_drydock' AND "name" = 'Apify — LinkedIn signals';

INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_apli', p."id", 'APIFY', 'linkedin.com', 'OPEN',
  'Found by search, replied to by hand in the browser. Your headline does the disclosing on LinkedIn, so a Reddit-style disclosure line reads as stilted — but answer the question first and never pitch under someone else''s post. One reply per thread, one person per thread.', 0, CURRENT_TIMESTAMP
FROM "Project" p;
