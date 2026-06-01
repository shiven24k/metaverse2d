-- AlterTable
ALTER TABLE "Element" ADD COLUMN     "blocking" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "blocking" BOOLEAN NOT NULL DEFAULT true;
