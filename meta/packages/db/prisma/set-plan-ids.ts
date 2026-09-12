import { PrismaClient, PlanTier } from "@prisma/client";

const client = new PrismaClient();

/**
 * Set Plan.razorpayPlanId for catalog rows without needing psql.
 * Args are triples of <TIER> <billingPeriod> <razorpayPlanId>.
 *
 * Usage:
 *   pnpm --filter @repo/db set-plan-ids            # list current catalog
 *   pnpm --filter @repo/db set-plan-ids STARTER monthly plan_xxx STARTER yearly plan_yyy PRO monthly plan_zzz PRO yearly plan_www
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const plans = await client.plan.findMany({ orderBy: [{ tier: "asc" }, { billingPeriod: "asc" }] });
    console.table(
      plans.map((p) => ({
        tier: p.tier,
        billingPeriod: p.billingPeriod,
        priceInPaiseINR: p.priceInPaiseINR,
        razorpayPlanId: p.razorpayPlanId ?? "—",
      }))
    );
    return;
  }

  if (args.length % 3 !== 0) {
    console.error("Usage: pnpm --filter @repo/db set-plan-ids <TIER> <billingPeriod> <razorpayPlanId> [more triples...]");
    process.exit(1);
  }

  for (let i = 0; i < args.length; i += 3) {
    const tier = args[i].toUpperCase() as PlanTier;
    const billingPeriod = args[i + 1];
    const razorpayPlanId = args[i + 2];
    if (tier === "FREE") {
      console.warn(`Skipping FREE (${billingPeriod}) — no checkout needed`);
      continue;
    }
    const r = await client.plan.updateMany({
      where: { tier, billingPeriod },
      data: { razorpayPlanId },
    });
    console.log(`${tier} ${billingPeriod}: ${r.count} row(s) -> ${razorpayPlanId}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await client.$disconnect();
  });
