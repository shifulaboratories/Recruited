-- The instance address as the person saw it, for links in mail. Never from an applicant's request.
ALTER TABLE "Mailbox" ADD COLUMN "siteUrl" TEXT NOT NULL DEFAULT '';
