-- Accounts, sessions, and a workspace trimmed to DryDock alone.
--
-- The migration history above this one is kept intact rather than rewritten:
-- it is what the existing database was built from, and editing applied
-- migrations is how you end up with two schemas that disagree. The other two
-- projects are removed here instead, by the same cascade the app would use.
PRAGMA defer_foreign_keys=ON;

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "mustChange" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");

-- ---- One brand ---------------------------------------------------------------
-- Every child row hangs off Project with ON DELETE CASCADE, so this is the whole
-- removal. Threads are shared across projects by id and are left alone; leads
-- pointing at them go with their monitors.
DELETE FROM "Project" WHERE "slug" <> 'drydock';

-- Poll runs and threads are not project-scoped by foreign key, so tidy the
-- orphans the cascade cannot reach.
DELETE FROM "PollRun" WHERE "projectId" IS NOT NULL AND "projectId" NOT IN (SELECT "id" FROM "Project");
DELETE FROM "Thread" WHERE "id" NOT IN (SELECT "threadId" FROM "Lead");
