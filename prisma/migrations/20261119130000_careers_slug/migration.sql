-- AlterTable
ALTER TABLE "User" ADD COLUMN     "careersSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_careersSlug_key" ON "User"("careersSlug");

