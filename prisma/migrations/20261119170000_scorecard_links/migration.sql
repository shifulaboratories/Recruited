-- One-use links for interviewers to fill in a scorecard without an account.
CREATE TABLE "ScorecardLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "interviewer" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "scorecardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScorecardLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScorecardLink_token_key" ON "ScorecardLink"("token");
CREATE INDEX "ScorecardLink_userId_interviewId_idx" ON "ScorecardLink"("userId", "interviewId");

ALTER TABLE "ScorecardLink" ADD CONSTRAINT "ScorecardLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScorecardLink" ADD CONSTRAINT "ScorecardLink_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
