-- Chordian AI signal pack: the same tiered structure DryDock now has,
-- rebuilt around memory infrastructure and data sovereignty.
--
-- Tier names match DryDock's on purpose, so switching projects doesn't mean
-- relearning the board. Keywords are reshaped per platform: short phrases for
-- Reddit and HN (which match quotes literally), natural language for LinkedIn
-- (which doesn't).
PRAGMA defer_foreign_keys=ON;

UPDATE "Monitor" SET "name" = 'T1 — Agent & institutional memory' WHERE "projectId" = 'proj_chordian' AND "name" = 'Agent memory pain — leads';
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_chordian', 'T1 — Agent & institutional memory', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_chordian' AND "name" = 'T1 — Agent & institutional memory');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["agent memory", "persistent memory", "memory layer", "long-term memory", "shared memory agents", "institutional memory", "organizational memory", "entity resolution", "MCP memory server", "knowledge graph memory", "memory for agents", "bi-temporal"]', "subreddits" = '["LocalLLaMA", "Rag", "AI_Agents", "LangChain", "LLMDevs", "mcp", "ClaudeAI", "cursor"]', "platforms" = '["REDDIT", "HACKERNEWS", "GITHUB"]', "sources" = '{"GITHUB": ["langchain-ai/langchain", "modelcontextprotocol/servers", "mem0ai/mem0", "getzep/zep"]}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_chordian' AND "name" = 'T1 — Agent & institutional memory';

UPDATE "Monitor" SET "name" = 'T1 — Memory tool requests' WHERE "projectId" = 'proj_chordian' AND "name" = 'Memory tool requests — high intent';
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_chordian', 'T1 — Memory tool requests', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_chordian' AND "name" = 'T1 — Memory tool requests');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["Mem0 alternative", "Zep alternative", "Glean alternative", "Letta alternative", "best memory layer", "memory recommendations", "vector DB alternative", "memory tool", "which memory layer"]', "subreddits" = '["LocalLLaMA", "Rag", "AI_Agents", "LangChain", "LLMDevs", "mcp", "ClaudeAI", "cursor", "ExperiencedDevs"]', "platforms" = '["REDDIT", "HACKERNEWS", "STACKOVERFLOW"]', "sources" = '{"STACKOVERFLOW": ["langchain", "retrieval-augmented-generation", "vector-database"]}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_chordian' AND "name" = 'T1 — Memory tool requests';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_chordian', 'T2 — RAG & retrieval pain', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_chordian' AND "name" = 'T2 — RAG & retrieval pain');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["RAG limitations", "stale embeddings", "outdated facts", "duplicate entities", "context window limit", "chunking strategy", "retrieval quality", "context engineering", "re-indexing", "RAG in production"]', "subreddits" = '["LocalLLaMA", "Rag", "AI_Agents", "LangChain", "LLMDevs", "mcp", "ClaudeAI", "cursor"]', "platforms" = '["REDDIT", "HACKERNEWS", "STACKOVERFLOW"]', "sources" = '{"STACKOVERFLOW": ["retrieval-augmented-generation", "langchain", "embedding"]}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_chordian' AND "name" = 'T2 — RAG & retrieval pain';

UPDATE "Monitor" SET "name" = 'T3 — Sovereignty & private AI' WHERE "projectId" = 'proj_chordian' AND "name" = 'Private & sovereign AI — leads';
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_chordian', 'T3 — Sovereignty & private AI', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_chordian' AND "name" = 'T3 — Sovereignty & private AI');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["on-prem LLM", "self-hosted AI", "air-gapped", "data sovereignty", "private AI", "shadow AI", "data residency", "no training on our data", "GDPR AI", "BYOC"]', "subreddits" = '["selfhosted", "cybersecurity", "sysadmin", "msp", "ITManagers", "cto", "devops", "LocalLLaMA"]', "platforms" = '["REDDIT", "HACKERNEWS"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_chordian' AND "name" = 'T3 — Sovereignty & private AI';

UPDATE "Monitor" SET "name" = 'T4 — Memory competitor watch' WHERE "projectId" = 'proj_chordian' AND "name" = 'Chordian — memory competitor watch';
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_chordian', 'T4 — Memory competitor watch', 'COMPETITOR', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_chordian' AND "name" = 'T4 — Memory competitor watch');
UPDATE "Monitor" SET "kind" = 'COMPETITOR', "keywords" = '["Mem0", "getzep", "Zep memory", "Letta", "MemGPT", "Supermemory", "Cognee", "LangMem", "Glean"]', "subreddits" = '["LocalLLaMA", "Rag", "AI_Agents", "LangChain", "LLMDevs", "mcp", "ClaudeAI", "cursor", "ExperiencedDevs"]', "platforms" = '["REDDIT", "HACKERNEWS", "GITHUB"]', "sources" = '{"GITHUB": ["mem0ai/mem0", "getzep/zep", "letta-ai/letta"]}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_chordian' AND "name" = 'T4 — Memory competitor watch';

UPDATE "Monitor" SET "name" = 'T4 — AI workspace competitor watch' WHERE "projectId" = 'proj_chordian' AND "name" = 'Chordian — AI workspace competitor watch';
INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_chordian', 'T4 — AI workspace competitor watch', 'COMPETITOR', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_chordian' AND "name" = 'T4 — AI workspace competitor watch');
UPDATE "Monitor" SET "kind" = 'COMPETITOR', "keywords" = '["Langdock", "Dust AI", "Credal", "Glean", "secure ChatGPT", "enterprise AI workspace", "CompanyGPT"]', "subreddits" = '["selfhosted", "cybersecurity", "sysadmin", "msp", "ITManagers", "cto", "devops", "OpenAI", "ExperiencedDevs"]', "platforms" = '["REDDIT", "HACKERNEWS"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_chordian' AND "name" = 'T4 — AI workspace competitor watch';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_chordian', 'T5 — Agent & MCP ecosystem', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_chordian' AND "name" = 'T5 — Agent & MCP ecosystem');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["AI agents production", "multi-agent", "MCP server", "agentic RAG", "enterprise search", "knowledge management AI", "AI knowledge base"]', "subreddits" = '["LocalLLaMA", "Rag", "AI_Agents", "LangChain", "LLMDevs", "mcp", "ClaudeAI", "cursor"]', "platforms" = '["REDDIT", "HACKERNEWS"]', "sources" = '{}', "scanComments" = 0, "active" = 1
WHERE "projectId" = 'proj_chordian' AND "name" = 'T5 — Agent & MCP ecosystem';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_chordian', 'Memory-gap phrases (comments)', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_chordian' AND "name" = 'Memory-gap phrases (comments)');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["starts from scratch", "starts from zero", "doesn''t remember", "forgets everything", "re-explain", "can we self-host", "runs on-prem", "where does the data live", "trains on our data", "lost the context"]', "subreddits" = '["LocalLLaMA", "Rag", "AI_Agents", "LangChain", "LLMDevs", "mcp", "ClaudeAI", "cursor", "selfhosted", "cybersecurity", "sysadmin", "msp", "ITManagers", "cto", "devops"]', "platforms" = '["REDDIT"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_chordian' AND "name" = 'Memory-gap phrases (comments)';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_chordian', 'Chordian brand mentions', 'BRAND', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_chordian' AND "name" = 'Chordian brand mentions');
UPDATE "Monitor" SET "kind" = 'BRAND', "keywords" = '["Chordian AI", "Chordian", "chordian.ai"]', "subreddits" = '[]', "platforms" = '["REDDIT", "HACKERNEWS", "GITHUB", "LINKEDIN"]', "sources" = '{}', "scanComments" = 1, "active" = 1
WHERE "projectId" = 'proj_chordian' AND "name" = 'Chordian brand mentions';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_chordian', 'Apify — X/Twitter signals', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_chordian' AND "name" = 'Apify — X/Twitter signals');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["agent memory", "memory layer", "Mem0", "Zep memory", "MCP memory", "RAG limitations", "entity resolution", "context engineering", "self-hosted AI", "air-gapped AI", "institutional memory", "agentic RAG"]', "subreddits" = '[]', "platforms" = '["APIFY"]', "sources" = '{"APIFY": ["X/Twitter \u2014 Chordian signals"]}', "scanComments" = 0, "active" = 1
WHERE "projectId" = 'proj_chordian' AND "name" = 'Apify — X/Twitter signals';

INSERT INTO "Monitor" ("id","projectId","name","kind","keywords","subreddits","platforms","sources","scanComments","active","createdAt")
SELECT 'mon_' || lower(hex(randomblob(8))), 'proj_chordian', 'Apify — LinkedIn signals', 'LEAD', '[]', '[]', '["REDDIT"]', '{}', 1, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Monitor" WHERE "projectId" = 'proj_chordian' AND "name" = 'Apify — LinkedIn signals');
UPDATE "Monitor" SET "kind" = 'LEAD', "keywords" = '["agent memory layer", "institutional memory AI", "AI knowledge management", "enterprise AI memory", "on-premise AI deployment", "data sovereignty AI", "shadow AI enterprise", "AI knowledge loss", "RAG in production", "enterprise search AI", "private AI infrastructure", "AI memory infrastructure"]', "subreddits" = '[]', "platforms" = '["APIFY"]', "sources" = '{"APIFY": ["LinkedIn posts \u2014 Chordian signals"]}', "scanComments" = 0, "active" = 1
WHERE "projectId" = 'proj_chordian' AND "name" = 'Apify — LinkedIn signals';

INSERT INTO "ApifyActor" ("id","projectId","name","actorId","channel","urlPattern","input","mapping","cadenceHours","maxRunsPerDay","maxItems","timeoutSecs","active","riskAccepted","createdAt")
SELECT 'apa_' || lower(hex(randomblob(8))), 'proj_chordian', 'X/Twitter — Chordian signals', 'apidojo~tweet-scraper', 'x.com', '', '{
  "searchTerms": {{keywords}},
  "maxItems": {{limit}},
  "sort": "Latest",
  "tweetLanguage": "en",
  "start": "{{sinceDate}}"
}', '{
  "id": "id|url",
  "title": "text",
  "body": "text|fullText|full_text",
  "author": "author/userName|author/name|username",
  "url": "url|twitterUrl",
  "createdAt": "createdAt|created_at",
  "score": "likeCount|favoriteCount|favorite_count",
  "numComments": "replyCount|reply_count"
}', 12, 2, 100, 150, 0, 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ApifyActor" WHERE "projectId" = 'proj_chordian' AND "name" = 'X/Twitter — Chordian signals');

INSERT INTO "ApifyActor" ("id","projectId","name","actorId","channel","urlPattern","input","mapping","cadenceHours","maxRunsPerDay","maxItems","timeoutSecs","active","riskAccepted","createdAt")
SELECT 'apa_' || lower(hex(randomblob(8))), 'proj_chordian', 'LinkedIn posts — Chordian signals', 'supreme_coder~linkedin-post', 'linkedin.com', 'https://www.linkedin.com/search/results/content/?keywords={kw}&datePosted=%22past-week%22&sortBy=%22date_posted%22', '{
  "urls": {{searchUrls}},
  "limitPerSource": {{limit}},
  "scrapeUntil": "{{sinceDate}}",
  "deepScrape": true,
  "numComments": 0,
  "numLikes": 0
}', '{
  "id": "urn|postUrl|url",
  "title": "text|postContent|content",
  "body": "text|postContent|content",
  "author": "authorName|author/name|author/firstName|authorHeadline",
  "url": "postUrl|url|link",
  "createdAt": "postedAtISO|postedAt|publishedAt|date",
  "score": "numLikes|likesCount|reactionsCount",
  "numComments": "numComments|commentsCount"
}', 24, 1, 60, 180, 0, 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ApifyActor" WHERE "projectId" = 'proj_chordian' AND "name" = 'LinkedIn posts — Chordian signals');

INSERT INTO "ApifyActor" ("id","projectId","name","actorId","channel","urlPattern","input","mapping","cadenceHours","maxRunsPerDay","maxItems","timeoutSecs","active","riskAccepted","createdAt")
SELECT 'apa_' || lower(hex(randomblob(8))), 'proj_chordian', 'G2 reviews — memory competitors', 'PASTE_ACTOR_ID', 'g2.com', '', '{
  "productNames": {{keywords}},
  "maxItems": {{limit}}
}', '{
  "id": "id|url",
  "title": "title|headline",
  "body": "text|review|content",
  "author": "reviewer|author|user",
  "url": "url|link",
  "createdAt": "date|publishedAt",
  "score": "rating"
}', 168, 1, 80, 180, 0, 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ApifyActor" WHERE "projectId" = 'proj_chordian' AND "name" = 'G2 reviews — memory competitors');

