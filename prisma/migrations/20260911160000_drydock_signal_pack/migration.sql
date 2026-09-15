-- DryDock signal pack: the tiered keyword strategy, reshaped per platform.
--
-- The terms were written as LinkedIn natural-language searches. Reddit and the
-- Algolia HN index match quoted phrases literally, so conversational fragments
-- ("AI making us faster but") return nothing there. Each tier is rewritten as
-- 2-3 word phrases and split across monitors so no single run exceeds the
-- per-source term caps.
PRAGMA defer_foreign_keys=ON;

UPDATE "Monitor" SET "name" = 'T1 — AI code governance' WHERE "projectId" = 'proj_drydock' AND "name" = 'AI code governance & compliance pain';
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_drydock', 'T1 — AI code governance', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_drydock' AND "name" = 'T1 — AI code governance');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["AI generated code", "AI code review", "code review bottleneck", "agent generated PR", "AI code quality", "who reviewed the code", "AI code accountability", "governing AI agents", "AI delivery governance", "policy gate", "human sign-off", "AI code risk"]', "subreddits" = '["EngineeringManagers", "ExperiencedDevs", "devops", "PlatformEngineering", "sre", "softwarearchitecture", "cto", "ClaudeAI", "cursor", "ChatGPTCoding", "GithubCopilot", "AI_Agents", "LLMDevs"]', "platforms" = '["REDDIT", "HACKERNEWS"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_drydock' AND "name" = 'T1 — AI code governance';

UPDATE "Monitor" SET "name" = 'T1 — AI coding spend' WHERE "projectId" = 'proj_drydock' AND "name" = 'AI cost & token spend';
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_drydock', 'T1 — AI coding spend', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_drydock' AND "name" = 'T1 — AI coding spend');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["Copilot ROI", "Copilot cost", "Copilot billing", "Copilot credits", "Cursor cost", "Claude Code cost", "token spend", "LLM cost", "cost attribution", "AI tooling budget", "AI spend"]', "subreddits" = '["ClaudeAI", "cursor", "ChatGPTCoding", "GithubCopilot", "AI_Agents", "LLMDevs", "EngineeringManagers", "cto", "devops"]', "platforms" = '["REDDIT", "HACKERNEWS"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_drydock' AND "name" = 'T1 — AI coding spend';

UPDATE "Monitor" SET "name" = 'T1 — Tool requests & evaluations' WHERE "projectId" = 'proj_drydock' AND "name" = 'Tool requests — engineering intelligence & governance';
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_drydock', 'T1 — Tool requests & evaluations', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_drydock' AND "name" = 'T1 — Tool requests & evaluations');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["engineering intelligence", "DORA metrics tool", "developer productivity platform", "LinearB alternative", "Jellyfish alternative", "Faros alternative", "AI code review tool", "code review tool", "engineering metrics tool", "release readiness"]', "subreddits" = '["EngineeringManagers", "ExperiencedDevs", "devops", "PlatformEngineering", "sre", "softwarearchitecture", "cto"]', "platforms" = '["REDDIT", "HACKERNEWS", "STACKOVERFLOW"]', "sources" = '{"STACKOVERFLOW": ["github-copilot", "code-review", "continuous-integration"]}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_drydock' AND "name" = 'T1 — Tool requests & evaluations';

UPDATE "Monitor" SET "name" = 'T2 — Delivery pain & AI rework' WHERE "projectId" = 'proj_drydock' AND "name" = 'AI delivery governance leads';
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_drydock', 'T2 — Delivery pain & AI rework', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_drydock' AND "name" = 'T2 — Delivery pain & AI rework');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["code review overwhelmed", "review queue", "AI code bugs", "AI rework", "AI productivity paradox", "velocity vs quality", "production incident", "measuring AI impact", "prove AI is working", "AI adoption challenges", "developer productivity"]', "subreddits" = '["EngineeringManagers", "ExperiencedDevs", "devops", "PlatformEngineering", "sre", "softwarearchitecture", "cto", "ClaudeAI", "cursor", "ChatGPTCoding", "GithubCopilot", "AI_Agents", "LLMDevs"]', "platforms" = '["REDDIT", "HACKERNEWS"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_drydock' AND "name" = 'T2 — Delivery pain & AI rework';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_drydock', 'T3 — Engineering leadership audience', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_drydock' AND "name" = 'T3 — Engineering leadership audience');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["DORA metrics", "platform engineering", "developer experience", "engineering leadership", "AI coding agents", "agentic development", "AI native development", "engineering productivity"]', "subreddits" = '["EngineeringManagers", "ExperiencedDevs", "devops", "PlatformEngineering", "sre", "softwarearchitecture", "cto"]', "platforms" = '["REDDIT", "HACKERNEWS"]', "sources" = '{}', "scanComments" = 0, "active" = 1
WHERE "projectId" = 'proj_drydock' AND "name" = 'T3 — Engineering leadership audience';

UPDATE "Monitor" SET "name" = 'T4 — Competitor & category watch' WHERE "projectId" = 'proj_drydock' AND "name" = 'Competitor watch';
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_drydock', 'T4 — Competitor & category watch', 'COMPETITOR', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_drydock' AND "name" = 'T4 — Competitor & category watch');
UPDATE "Monitor" SET "kind" = 'COMPETITOR', "keywords" = '["LinearB", "Jellyfish", "CodeRabbit", "Qodo", "Faros", "Swarmia", "getdx", "Plandek", "Graphite code review", "engineering intelligence platform", "Exceeds.ai", "Kovil"]', "subreddits" = '["EngineeringManagers", "ExperiencedDevs", "devops", "PlatformEngineering", "sre", "softwarearchitecture", "cto", "ClaudeAI", "cursor", "ChatGPTCoding", "GithubCopilot", "AI_Agents", "LLMDevs"]', "platforms" = '["REDDIT", "HACKERNEWS"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_drydock' AND "name" = 'T4 — Competitor & category watch';

UPDATE "Monitor" SET "name" = 'T5 — Compliance & policy triggers' WHERE "projectId" = 'proj_drydock' AND "name" = 'Governance & compliance vendors';
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_drydock', 'T5 — Compliance & policy triggers', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_drydock' AND "name" = 'T5 — Compliance & policy triggers');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["EU AI Act", "SOC 2", "audit trail", "AI compliance", "shadow AI", "AI tool sprawl", "Copilot enterprise", "AI policy", "AI governance policy"]', "subreddits" = '["EngineeringManagers", "ExperiencedDevs", "devops", "PlatformEngineering", "sre", "softwarearchitecture", "cto", "cybersecurity", "sysadmin"]', "platforms" = '["REDDIT", "HACKERNEWS"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_drydock' AND "name" = 'T5 — Compliance & policy triggers';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_drydock', 'Governance-gap phrases (comments)', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_drydock' AND "name" = 'Governance-gap phrases (comments)');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["who reviewed", "who signed off", "how do we enforce", "who is governing", "who''s accountable", "nobody reviews", "rubber stamp", "who approved"]', "subreddits" = '["EngineeringManagers", "ExperiencedDevs", "devops", "PlatformEngineering", "sre", "softwarearchitecture", "cto", "ClaudeAI", "cursor", "ChatGPTCoding", "GithubCopilot", "AI_Agents", "LLMDevs"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_drydock' AND "name" = 'Governance-gap phrases (comments)';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_drydock', 'DryDock brand mentions', 'BRAND', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_drydock' AND "name" = 'DryDock brand mentions');
UPDATE "Monitor" SET "kind" = 'BRAND', "keywords" = '["DryDock AI", "DryDock", "usedrydock", "Dockmaster"]', "subreddits" = '[]', "platforms" = '["REDDIT", "HACKERNEWS", "GITHUB", "LINKEDIN"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_drydock' AND "name" = 'DryDock brand mentions';

INSERT INTO "ApifyActor" ("id","projectId","name","actorId","channel","input","mapping","cadenceHours","maxRunsPerDay","maxItems","timeoutSecs","active","createdAt")
SELECT 'apa_' || lower(hex(randomblob(8))), 'proj_drydock', 'X/Twitter — DryDock signals', 'PASTE_ACTOR_ID', 'x.com',
  '{
  "searchTerms": {{keywords}},
  "maxItems": {{limit}},
  "sort": "Latest",
  "start": "{{sinceDate}}",
  "tweetLanguage": "en"
}', '{
  "id": "id|url",
  "title": "text",
  "body": "text|full_text",
  "author": "author/userName|author/name|username",
  "url": "url|twitterUrl",
  "createdAt": "createdAt|created_at",
  "score": "likeCount|favorite_count",
  "numComments": "replyCount|reply_count"
}', 12, 2, 100, 150, 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ApifyActor" WHERE "projectId" = 'proj_drydock' AND "name" = 'X/Twitter — DryDock signals');
