-- CreateTable
CREATE TABLE "SpacePortal" (
    "id" TEXT NOT NULL,
    "fromSpaceId" TEXT NOT NULL,
    "toSpaceId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Portal',

    CONSTRAINT "SpacePortal_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SpacePortal" ADD CONSTRAINT "SpacePortal_fromSpaceId_fkey" FOREIGN KEY ("fromSpaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpacePortal" ADD CONSTRAINT "SpacePortal_toSpaceId_fkey" FOREIGN KEY ("toSpaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
