import client from "@repo/db/client";

/**
 * Shared plan-gating helpers for both the HTTP and WS services.
 *
 * - `getEffectivePlan(userId)` returns the user's ACTIVE plan, or FREE defaults.
 * - Subscription/plan lookups are cached in-memory for 60s to cut DB round-trips
 *   on every gated action (esp. per-join concurrent-user checks).
 * - Prisma P2024 (Neon pool timeout) is retried with backoff and logged
 *   explicitly — a silent failure here could wrongly block a paying user.
 */

const PLAN_CACHE_TTL_MS = 60_000;
const SUB_CACHE_TTL_MS = 60_000;
const MAX_RETRIES = 2;

export interface EffectivePlan {
    id: string;
    tier: string;
    name: string;
    priceInPaiseINR: number;
    billingPeriod: string;
    maxSpaces: number;
    maxMembersPerSpace: number;
    maxConcurrentUsers: number;
    screenShareEnabled: boolean;
    broadcastEnabled: boolean;
    razorpayPlanId: string | null;
    createdAt: Date;
}

const FREE_DEFAULTS: EffectivePlan = {
    id: "plan-free",
    tier: "FREE",
    name: "Free",
    priceInPaiseINR: 0,
    billingPeriod: "monthly",
    maxSpaces: 1,
    maxMembersPerSpace: 10,
    maxConcurrentUsers: 10,
    screenShareEnabled: false,
    broadcastEnabled: false,
    razorpayPlanId: null,
    createdAt: new Date(0),
};

const planCache = new Map<string, { plan: EffectivePlan; expiresAt: number }>();
const subCache = new Map<string, { status: string | null; expiresAt: number }>();

/** Retry a Prisma call on P2024 (connection pool exhausted) with backoff. */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
        try {
            return await fn();
        } catch (err) {
            const code = (err as { code?: string }).code;
            if (code === "P2024" && attempt < MAX_RETRIES) {
                attempt++;
                console.warn(`[planAccess] P2024 pool timeout, retrying (${attempt}/${MAX_RETRIES})`);
                await new Promise((r) => setTimeout(r, 50 * attempt));
                continue;
            }
            throw err;
        }
    }
}

let freePlanPromise: Promise<EffectivePlan> | null = null;
async function getFreePlan(): Promise<EffectivePlan> {
    if (!freePlanPromise) {
        freePlanPromise = (async () => {
            const row = await client.plan.findFirst({
                where: { tier: "FREE", billingPeriod: "monthly" },
            });
            return row ? { ...FREE_DEFAULTS, ...row } : FREE_DEFAULTS;
        })().catch((err) => {
            console.warn("[planAccess] FREE plan lookup failed, using defaults:", err);
            return FREE_DEFAULTS;
        });
    }
    return freePlanPromise;
}

export async function getActiveSubscriptionStatus(userId: string): Promise<string | null> {
    const cached = subCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) return cached.status;

    let status: string | null = null;
    try {
        const sub = await withRetry(() =>
            client.subscription.findUnique({
                where: { ownerId: userId },
                select: { status: true },
            })
        );
        status = sub?.status ?? null;
    } catch (err) {
        console.error("[planAccess] subscription lookup failed:", err);
    }
    subCache.set(userId, { status, expiresAt: Date.now() + SUB_CACHE_TTL_MS });
    return status;
}

export async function getEffectivePlan(userId: string): Promise<EffectivePlan> {
    const cached = planCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) return cached.plan;

    const status = await getActiveSubscriptionStatus(userId);
    let plan: EffectivePlan = FREE_DEFAULTS;
    if (status === "ACTIVE") {
        try {
            const sub = await withRetry(() =>
                client.subscription.findUnique({
                    where: { ownerId: userId },
                    include: { plan: true },
                })
            );
            if (sub?.plan) {
                plan = { ...FREE_DEFAULTS, ...sub.plan };
            }
        } catch (err) {
            console.error("[planAccess] plan lookup failed — defaulting to Free:", err);
        }
    }
    planCache.set(userId, { plan, expiresAt: Date.now() + PLAN_CACHE_TTL_MS });
    return plan;
}

export async function isBroadcastAllowed(userId: string): Promise<boolean> {
    return (await getEffectivePlan(userId)).broadcastEnabled;
}

export async function isScreenShareAllowed(userId: string): Promise<boolean> {
    return (await getEffectivePlan(userId)).screenShareEnabled;
}

export async function getSpaceCount(userId: string): Promise<number> {
    return withRetry(() => client.space.count({ where: { creatorId: userId } }));
}

/** Drop cached plan/subscription state for a user (call after billing changes). */
export function invalidatePlanCache(userId: string): void {
    planCache.delete(userId);
    subCache.delete(userId);
}