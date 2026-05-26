-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayUsername" TEXT,
ALTER COLUMN "username" DROP NOT NULL;
