-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "probes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "shareSlug" TEXT,
ADD COLUMN     "sharedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "sample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "bookToken" TEXT,
ADD COLUMN     "slots" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[];

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "afterApply" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "companyAbout" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "companyWebsite" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "relation" TEXT NOT NULL DEFAULT '',
    "token" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reference_token_key" ON "Reference"("token");

-- CreateIndex
CREATE INDEX "Reference_userId_applicationId_idx" ON "Reference"("userId", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_shareSlug_key" ON "Application"("shareSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Interview_bookToken_key" ON "Interview"("bookToken");

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

