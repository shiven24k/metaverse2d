import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('planAccess', () => {
    let client: typeof import('@repo/db/client').default;
    let getEffectivePlan: typeof import('../../apps/ws/src/lib/planAccess').getEffectivePlan;
    let invalidatePlanCache: typeof import('../../apps/ws/src/lib/planAccess').invalidatePlanCache;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        const [planAccessMod, clientMod] = await Promise.all([
            import('../../apps/ws/src/lib/planAccess'),
            import('@repo/db/client'),
        ]);
        getEffectivePlan = planAccessMod.getEffectivePlan;
        invalidatePlanCache = planAccessMod.invalidatePlanCache;
        client = clientMod.default;
    });

    it('returns FREE defaults (5 concurrent / 5 members) when user has no subscription', async () => {
        const mocked = vi.mocked(client);
        mocked.subscription.findUnique.mockResolvedValue(null);
        mocked.plan.findFirst.mockResolvedValue(null);

        const plan = await getEffectivePlan('user-free');

        expect(plan.tier).toBe('FREE');
        expect(plan.maxSpaces).toBe(1);
        expect(plan.maxMembersPerSpace).toBe(5);
        expect(plan.maxConcurrentUsers).toBe(5);
        expect(plan.screenShareEnabled).toBe(false);
        expect(plan.broadcastEnabled).toBe(false);
    });

    it('returns paid plan limits when subscription is ACTIVE', async () => {
        const mocked = vi.mocked(client);
        mocked.subscription.findUnique
            .mockResolvedValueOnce({ status: 'ACTIVE' } as any)
            .mockResolvedValueOnce({
                plan: {
                    id: 'plan-pro',
                    tier: 'PRO',
                    name: 'Pro',
                    priceInPaiseINR: 99900,
                    billingPeriod: 'monthly',
                    maxSpaces: 100000,
                    maxMembersPerSpace: 100,
                    maxConcurrentUsers: 100,
                    screenShareEnabled: true,
                    broadcastEnabled: true,
                    razorpayPlanId: 'plan_xxx',
                    createdAt: new Date(),
                },
            } as any);

        const plan = await getEffectivePlan('user-pro');

        expect(plan.tier).toBe('PRO');
        expect(plan.maxConcurrentUsers).toBe(100);
        expect(plan.maxMembersPerSpace).toBe(100);
        expect(plan.broadcastEnabled).toBe(true);
    });

    it('keeps paid plan limits during PAST_DUE grace window', async () => {
        const mocked = vi.mocked(client);
        mocked.subscription.findUnique
            .mockResolvedValueOnce({ status: 'PAST_DUE' } as any)
            .mockResolvedValueOnce({
                plan: {
                    id: 'plan-starter',
                    tier: 'STARTER',
                    name: 'Starter',
                    priceInPaiseINR: 29900,
                    billingPeriod: 'monthly',
                    maxSpaces: 3,
                    maxMembersPerSpace: 30,
                    maxConcurrentUsers: 30,
                    screenShareEnabled: true,
                    broadcastEnabled: false,
                    razorpayPlanId: 'plan_yyy',
                    createdAt: new Date(),
                },
            } as any);

        const plan = await getEffectivePlan('user-pastdue');

        expect(plan.tier).toBe('STARTER');
        expect(plan.maxConcurrentUsers).toBe(30);
        expect(plan.broadcastEnabled).toBe(false);
    });

    it('falls back to FREE defaults when subscription is CANCELED', async () => {
        const mocked = vi.mocked(client);
        mocked.subscription.findUnique.mockResolvedValue({ status: 'CANCELED' } as any);
        mocked.plan.findFirst.mockResolvedValue(null);

        const plan = await getEffectivePlan('user-canceled');

        expect(plan.tier).toBe('FREE');
        expect(plan.maxConcurrentUsers).toBe(5);
    });
});
