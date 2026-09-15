-- Record which project a poll covered, so "last poll" is honest per project.
-- NULL means the run swept every project (the cron route).
ALTER TABLE "PollRun" ADD COLUMN "projectId" TEXT;
CREATE INDEX "PollRun_projectId_startedAt_idx" ON "PollRun"("projectId", "startedAt");
