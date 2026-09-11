-- Space access control: visibility enum + access requests (email-approval flow).

-- CreateEnum
CREATE TYPE "SpaceVisibility" AS ENUM ('PRIVATE', 'INVITE_ONLY', 'PUBLIC');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');

-- AlterTable: replace boolean isPrivate with the visibility enum.
-- Backfill: existing private spaces -> PRIVATE, existing public spaces -> PUBLIC.
ALTER TABLE "Space" ADD COLUMN "visibility" "SpaceVisibility";
UPDATE "Space" SET "visibility" = CASE WHEN "isPrivate" THEN 'PRIVATE'::"SpaceVisibility" ELSE 'PUBLIC'::"SpaceVisibility" END;
ALTER TABLE "Space" ALTER COLUMN "visibility" SET NOT NULL;
ALTER TABLE "Space" ALTER COLUMN "visibility" SET DEFAULT 'PRIVATE'::"SpaceVisibility";
ALTER TABLE "Space" DROP COLUMN "isPrivate";

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- One pending request per (space, user) — Prisma can't express partial indexes.
CREATE UNIQUE INDEX "access_request_pending_unique"
    ON "AccessRequest" ("spaceId", "requesterId")
    WHERE status = 'PENDING';

-- CreateIndex
CREATE INDEX "AccessRequest_spaceId_idx" ON "AccessRequest"("spaceId");
CREATE INDEX "AccessRequest_requesterId_idx" ON "AccessRequest"("requesterId");

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;