-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "dailyReplyCap" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN "scanComments" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'POST';
ALTER TABLE "Thread" ADD COLUMN "linkId" TEXT;
ALTER TABLE "Thread" ADD COLUMN "linkTitle" TEXT;
ALTER TABLE "Thread" ADD COLUMN "parentId" TEXT;

-- AlterTable
ALTER TABLE "Reply" ADD COLUMN "score" INTEGER;
ALTER TABLE "Reply" ADD COLUMN "replyCount" INTEGER;
ALTER TABLE "Reply" ADD COLUMN "removed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Reply" ADD COLUMN "checkedAt" DATETIME;

-- CreateTable
CREATE TABLE "ReplyStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "replyId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "replyCount" INTEGER NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReplyStat_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "Reply" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReplyStat_replyId_at_idx" ON "ReplyStat"("replyId", "at");
