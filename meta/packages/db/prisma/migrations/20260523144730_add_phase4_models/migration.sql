-- AlterTable
ALTER TABLE "User" ADD COLUMN     "supporter" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "theme" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonalItem" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "SeasonalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Neighbourhood" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Neighbourhood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeighbourhoodMember" (
    "id" TEXT NOT NULL,
    "neighbourhoodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "NeighbourhoodMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeasonalItem_seasonId_itemId_key" ON "SeasonalItem"("seasonId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "NeighbourhoodMember_userId_key" ON "NeighbourhoodMember"("userId");

-- AddForeignKey
ALTER TABLE "SeasonalItem" ADD CONSTRAINT "SeasonalItem_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonalItem" ADD CONSTRAINT "SeasonalItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeighbourhoodMember" ADD CONSTRAINT "NeighbourhoodMember_neighbourhoodId_fkey" FOREIGN KEY ("neighbourhoodId") REFERENCES "Neighbourhood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeighbourhoodMember" ADD CONSTRAINT "NeighbourhoodMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
