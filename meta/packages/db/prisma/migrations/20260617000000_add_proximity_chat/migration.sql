-- CreateTable
CREATE TABLE "ProximityRoom" (
    "id" TEXT NOT NULL,
    "roomKey" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProximityRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProximityChatMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProximityChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProximityRoom_roomKey_key" ON "ProximityRoom"("roomKey");

-- AddForeignKey
ALTER TABLE "ProximityChatMessage" ADD CONSTRAINT "ProximityChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ProximityRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
