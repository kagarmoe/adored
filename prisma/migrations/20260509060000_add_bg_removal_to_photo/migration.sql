-- AlterTable
ALTER TABLE "Photo"
  ADD COLUMN "originalBlobKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "bgRemoved" BOOLEAN NOT NULL DEFAULT false;
