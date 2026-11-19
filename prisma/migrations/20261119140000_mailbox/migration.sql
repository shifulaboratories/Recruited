-- The person's own mailbox over SMTP, and how each message went out.
ALTER TYPE "MessageKind" ADD VALUE 'RECEIPT' BEFORE 'SCREENING_INVITE';

ALTER TABLE "Message" ADD COLUMN "sentVia" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Message" ADD COLUMN "sendError" TEXT NOT NULL DEFAULT '';

CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "security" TEXT NOT NULL DEFAULT 'starttls',
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT NOT NULL DEFAULT '',
    "receiptOn" BOOLEAN NOT NULL DEFAULT true,
    "receiptSubject" TEXT NOT NULL DEFAULT '',
    "receiptBody" TEXT NOT NULL DEFAULT '',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Mailbox_userId_key" ON "Mailbox"("userId");

ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
