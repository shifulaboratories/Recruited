-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('SCREENING_INVITE', 'INTERVIEW_INVITE', 'REJECTION', 'OFFER', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('DRAFT', 'SENT');

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "writtenBy" TEXT NOT NULL DEFAULT 'mcp',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_userId_applicationId_idx" ON "Message"("userId", "applicationId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
