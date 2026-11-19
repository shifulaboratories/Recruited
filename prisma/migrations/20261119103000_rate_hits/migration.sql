-- CreateTable
CREATE TABLE "RateHit" (
    "key" TEXT NOT NULL,
    "window" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RateHit_pkey" PRIMARY KEY ("key","window")
);

-- CreateIndex
CREATE INDEX "RateHit_window_idx" ON "RateHit"("window");
