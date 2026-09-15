-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "playbook" TEXT NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "signal" TEXT;

-- CreateTable
CREATE TABLE "SubredditRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "policy" TEXT NOT NULL DEFAULT 'DISCLOSE',
    "notes" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SubredditRule_name_key" ON "SubredditRule"("name");
