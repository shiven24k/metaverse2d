-- Add pending checkout fields so a user can start a new plan checkout
-- without losing their current active subscription until payment is confirmed.

ALTER TABLE "Subscription" ADD COLUMN "pendingPlanId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "pendingRazorpaySubscriptionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "pendingShortUrl" TEXT;

CREATE UNIQUE INDEX "Subscription_pendingRazorpaySubscriptionId_key" ON "Subscription"("pendingRazorpaySubscriptionId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
