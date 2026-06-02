-- CreateEnum
CREATE TYPE "NPCMotion" AS ENUM ('STATIC', 'PATROL', 'WANDER');

-- AlterTable: add motionType and wanderRadius to NPC
ALTER TABLE "NPC" ADD COLUMN "motionType" "NPCMotion" NOT NULL DEFAULT 'PATROL';
ALTER TABLE "NPC" ADD COLUMN "wanderRadius" INTEGER NOT NULL DEFAULT 3;
