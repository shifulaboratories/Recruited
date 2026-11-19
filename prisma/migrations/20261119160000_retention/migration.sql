-- Applicant data retention: how long, who to write to, and when each job closed.
ALTER TABLE "User" ADD COLUMN "retentionMonths" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "User" ADD COLUMN "privacyEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Job" ADD COLUMN "closedAt" TIMESTAMP(3);

-- Jobs closed before this column existed start their clock from their last change.
UPDATE "Job" SET "closedAt" = "updatedAt" WHERE "status" = 'CLOSED';
