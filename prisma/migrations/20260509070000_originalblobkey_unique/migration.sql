-- AlterTable
ALTER TABLE "Photo" ALTER COLUMN "originalBlobKey" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Photo_originalBlobKey_key" ON "Photo"("originalBlobKey");
