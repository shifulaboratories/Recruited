-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('A', 'B', 'C');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "proposedAt" TIMESTAMP(3),
ADD COLUMN     "proposedRank" INTEGER,
ADD COLUMN     "proposedReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "proposedTier" "Tier",
ADD COLUMN     "tier" "Tier",
ADD COLUMN     "tierAt" TIMESTAMP(3),
ADD COLUMN     "tierBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tierReason" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "rubric" TEXT NOT NULL DEFAULT '';
