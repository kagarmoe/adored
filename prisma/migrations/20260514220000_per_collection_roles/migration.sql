-- Per-collection role model (purses-72e).
--
-- Adds CollectionMembership (the per-collection authorization source of truth)
-- and CollectionInvite (a pending "add a curator" by email, claimed on sign-in),
-- backfills memberships from the existing (Collection.ownerId, User.role) pairs,
-- then drops the now-global-meaningless User.role.
--
-- Order is load-bearing: the backfill MUST run before User.role is dropped.
-- Deploy: hand-apply this file against Neon (consistent with the three prior
-- migrations — the repo has no migration_lock.toml and `npm run build` does not
-- run `prisma migrate deploy`).

-- CreateTable
CREATE TABLE "CollectionMembership" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionInvite" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'curator',
    "invitedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    CONSTRAINT "CollectionInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionMembership_collectionId_userId_key" ON "CollectionMembership"("collectionId", "userId");
CREATE UNIQUE INDEX "CollectionInvite_collectionId_email_key" ON "CollectionInvite"("collectionId", "email");

-- AddForeignKey
ALTER TABLE "CollectionMembership" ADD CONSTRAINT "CollectionMembership_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionMembership" ADD CONSTRAINT "CollectionMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionInvite" ADD CONSTRAINT "CollectionInvite_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionInvite" ADD CONSTRAINT "CollectionInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing collection's owner becomes a member with their old
-- global role. This runs BEFORE the DROP COLUMN below. Covers the demo user +
-- demo collection (the only data that must survive) and any other live data.
INSERT INTO "CollectionMembership" ("collectionId", "userId", "role", "createdAt")
SELECT c."id", c."ownerId", u."role", c."createdAt"
FROM "Collection" c
JOIN "User" u ON u."id" = c."ownerId";

-- AlterTable: name gains a default so self-signup (createUser with no name) works;
-- role is now per-collection, so the global column is dropped.
ALTER TABLE "User" ALTER COLUMN "name" SET DEFAULT '';
ALTER TABLE "User" DROP COLUMN "role";

-- AlterTable: rankingCompletedAt is stamped when a curator drives the ranking
-- to termination; operators may view ranked-tier results only once it is set.
ALTER TABLE "Collection" ADD COLUMN "rankingCompletedAt" TIMESTAMP(3);
