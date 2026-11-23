-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "step" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "steps" JSONB NOT NULL DEFAULT '[]';

