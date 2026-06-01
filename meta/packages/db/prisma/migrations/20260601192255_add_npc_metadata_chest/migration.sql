-- AlterTable
ALTER TABLE "PlacedItem" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "NPC" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sprite" TEXT NOT NULL DEFAULT 'avatar-default',
    "dialogues" TEXT[],
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "patrolPath" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "NPC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChestInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placedItemId" TEXT NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChestInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChestInteraction_userId_placedItemId_key" ON "ChestInteraction"("userId", "placedItemId");

-- AddForeignKey
ALTER TABLE "NPC" ADD CONSTRAINT "NPC_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChestInteraction" ADD CONSTRAINT "ChestInteraction_placedItemId_fkey" FOREIGN KEY ("placedItemId") REFERENCES "PlacedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
