/*
  Warnings:

  - You are about to drop the column `x` on the `SpacePortal` table. All the data in the column will be lost.
  - You are about to drop the column `y` on the `SpacePortal` table. All the data in the column will be lost.
  - Added the required column `fromEdge` to the `SpacePortal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `toEdge` to the `SpacePortal` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SpaceEdge" AS ENUM ('NORTH', 'SOUTH', 'EAST', 'WEST');

-- AlterTable
ALTER TABLE "SpacePortal" DROP COLUMN "x",
DROP COLUMN "y",
ADD COLUMN     "fromEdge" "SpaceEdge" NOT NULL,
ADD COLUMN     "toEdge" "SpaceEdge" NOT NULL;
