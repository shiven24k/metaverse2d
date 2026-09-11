-- Dunning: track when a failed payment's grace period ends so the scheduler can auto-downgrade.
ALTER TABLE "Subscription" ADD COLUMN "graceEndsAt" TIMESTAMP(3);