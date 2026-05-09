-- AlterTable
ALTER TABLE "Collection" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex (filtered: only non-trivially demo rows; expected to be a single row, but
-- index helps host-based lookups and avoids accidental multi-demo creation in dev).
CREATE INDEX "Collection_isDemo_idx" ON "Collection"("isDemo") WHERE "isDemo" = true;
