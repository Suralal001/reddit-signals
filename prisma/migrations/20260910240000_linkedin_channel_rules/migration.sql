-- LinkedIn channel policies. LinkedIn is a business network, so naming what
-- you build is normal there in a way it never is on Reddit — but a comment
-- under someone else's post is still their thread, not an ad slot.
INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_li', p."id", 'LINKEDIN', 'linkedin.com', 'OPEN',
  'Your headline does the disclosing here — people can see where you work, so a separate disclosure line reads as stilted. Still: answer the question first, and never pitch under someone else''s post. Links in comments are allowed but get suppressed by the feed, so put the substance in the comment and offer the link only if asked. Never comment from more than one company account on the same post.', 1, CURRENT_TIMESTAMP
FROM "Project" p;

INSERT OR IGNORE INTO "SubredditRule" ("id","projectId","platform","name","policy","notes","verified","updatedAt")
SELECT 'rule_' || p."slug" || '_lisn', p."id", 'LINKEDIN', 'sales-navigator', 'NO_PROMO',
  'Sales Navigator alerts are a research signal, not a thread to reply to. Nothing here gets a public comment — use it to decide who is worth a real conversation, then reach out properly.', 1, CURRENT_TIMESTAMP
FROM "Project" p;
