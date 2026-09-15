import { Router } from "express";
import crypto from "crypto";
import { userMiddleware } from "../../middleware/user";
import { getEffectivePlan, invalidatePlanCache } from "../../../../ws/src/lib/planAccess";
import { sendEmail } from "../../lib/email";
import { GRACE_DAYS, GRACE_DAYS_MS } from "../../lib/dunning";
import { resolveRegion } from "../../lib/geo";
import { INR_RATES } from "../../lib/currency";
import client from "@repo/db/client";

export const billingRouter = Router();

const RAZORPAY_API = "https://api.razorpay.com/v1";

// Per-user in-process lock so concurrent subscribe requests can't create two
// Razorpay subscriptions (double charge). Single-node; a multi-instance deploy
// should use Redis/DB-level locking instead.
const subscribeInFlight = new Set<string>();

function razorpayAuth(): string | null {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return null;
    return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

/**
 * Create a Razorpay subscription for a plan. total_count = 12 auto-charge cycles
 * (12 months for monthly, 12 years for yearly) so recurring billing keeps running
 * without manual re-pay; after the 12th cycle `subscription.completed` fires and
 * the webhook attempts a renewal.
 */
async function createRazorpaySubscription(
    plan: { id: string; razorpayPlanId: string | null; billingPeriod: string },
    ownerId: string
): Promise<{ id: string; short_url?: string | null }> {
    const auth = razorpayAuth();
    if (!auth || !plan.razorpayPlanId) throw new Error("razorpay not configured");
    const resp = await fetch(`${RAZORPAY_API}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({
            plan_id: plan.razorpayPlanId,
            customer_notify: 1,
            total_count: 12,
            notes: { planId: plan.id, ownerId },
        }),
    });
    if (!resp.ok) {
        const errText = await resp.text();
        console.error("[billing] Razorpay create subscription failed:", resp.status, errText);
        throw new Error("razorpay create failed");
    }
    return (await resp.json()) as { id: string; short_url?: string | null };
}

/** Best-effort: cancel a Razorpay subscription. */
async function cancelRazorpay(rzSubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    const auth = razorpayAuth();
    if (!auth) return;
    try {
        const resp = await fetch(`${RAZORPAY_API}/subscriptions/${rzSubscriptionId}/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({ cancel_at_cycle_end: atPeriodEnd }),
        });
        if (!resp.ok) console.warn("[billing] cancel-razorpay failed:", resp.status, await resp.text());
    } catch (err) {
        console.warn("[billing] cancel-razorpay error:", err);
    }
}

async function findSubscriptionByRazorpayId(rzSubscriptionId: string) {
    return client.subscription.findFirst({
        where: {
            OR: [
                { razorpaySubscriptionId: rzSubscriptionId },
                { pendingRazorpaySubscriptionId: rzSubscriptionId },
            ],
        },
        include: { plan: true, pendingPlan: true, owner: { select: { email: true, name: true } } },
    });
}

const fromEpoch = (s?: number | null): Date | null => (s ? new Date(s * 1000) : null);

async function recordInvoice(
    subscriptionId: string,
    payment: { id?: string; amount?: number; currency?: string; created_at?: number | null } | undefined,
    status: "paid" | "failed",
    invoiceId?: string
) {
    const paymentId = payment?.id;
    if (!paymentId) return;
    const existing = await client.invoice.findUnique({ where: { razorpayPaymentId: paymentId } });
    if (existing) return;
    try {
        await client.invoice.create({
            data: {
                subscriptionId,
                razorpayPaymentId: paymentId,
                razorpayInvoiceId: invoiceId ?? undefined,
                amountInPaise: payment?.amount ?? 0,
                currency: payment?.currency ?? "INR",
                status,
                paidAt: status === "paid" ? fromEpoch(payment?.created_at) : null,
            },
        });
    } catch (err) {
        // Concurrent webhook delivery already inserted it (P2002) — safe to ignore.
        if ((err as { code?: string }).code !== "P2002") throw err;
    }
}

async function activatePendingPlan(
    subscription: {
        id: string;
        pendingPlanId: string | null;
        pendingRazorpaySubscriptionId: string | null;
        currentPeriodStart: Date | null;
        currentPeriodEnd: Date | null;
    },
    periodStart: Date | null,
    periodEnd: Date | null
): Promise<boolean> {
    if (!subscription || !subscription.pendingPlanId || !subscription.pendingRazorpaySubscriptionId) {
        console.warn("[billing] activatePendingPlan skipped — no pending plan to activate:", subscription?.id);
        return false;
    }
    await client.subscription.update({
        where: { id: subscription.id },
        data: {
            planId: subscription.pendingPlanId,
            status: "ACTIVE",
            razorpaySubscriptionId: subscription.pendingRazorpaySubscriptionId,
            pendingPlanId: null,
            pendingRazorpaySubscriptionId: null,
            pendingShortUrl: null,
            cancelAtPeriodEnd: false,
            graceEndsAt: null,
            currentPeriodStart: periodStart ?? subscription.currentPeriodStart,
            currentPeriodEnd: periodEnd ?? subscription.currentPeriodEnd,
        },
    });
    return true;
}

// Config health for the billing UI (public flags + the PUBLIC key id used to
// init the Razorpay checkout modal — key ids are safe to expose; the secret
// never leaves the server).
billingRouter.get("/health", async (_req, res) => {
    const plansWithoutIds = await client.plan.count({ where: { razorpayPlanId: null } });
    res.json({
        razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        razorpayWebhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
        resendConfigured: Boolean(process.env.RESEND_API_KEY),
        plansMissingRazorpayIds: plansWithoutIds,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? null,
    });
});

// Public plan catalog for the pricing / billing UI.
billingRouter.get("/plans", async (_req, res) => {
    const plans = await client.plan.findMany({
        orderBy: [{ priceInPaiseINR: "asc" }, { billingPeriod: "asc" }],
    });
    res.json({
        plans: plans.map((p) => ({
            id: p.id,
            tier: p.tier,
            name: p.name,
            priceInPaiseINR: p.priceInPaiseINR,
            billingPeriod: p.billingPeriod,
            maxSpaces: p.maxSpaces,
            maxMembersPerSpace: p.maxMembersPerSpace,
            maxConcurrentUsers: p.maxConcurrentUsers,
            screenShareEnabled: p.screenShareEnabled,
            broadcastEnabled: p.broadcastEnabled,
        })),
    });
});

// Resolve the caller's display currency from their IP (server-side). Public.
// Prices are always charged in INR; this only localizes what the UI shows.
billingRouter.get("/region", async (req, res) => {
    const region = await resolveRegion(req);
    res.json({
        country: region.country,
        currency: region.currency,
        locale: region.locale,
        base: "INR",
        rates: INR_RATES,
    });
});

// Current user's effective plan + subscription state (what the UI reflects).
billingRouter.get("/plan", userMiddleware, async (req, res) => {
    const plan = await getEffectivePlan(req.userId!);
    const sub = await client.subscription.findUnique({
        where: { ownerId: req.userId! },
        include: {
            pendingPlan: {
                select: {
                    id: true,
                    tier: true,
                    name: true,
                    priceInPaiseINR: true,
                    billingPeriod: true,
                },
            },
        },
    });
    res.json({
        plan: {
            id: plan.id,
            tier: plan.tier,
            name: plan.name,
            maxSpaces: plan.maxSpaces,
            maxMembersPerSpace: plan.maxMembersPerSpace,
            maxConcurrentUsers: plan.maxConcurrentUsers,
            screenShareEnabled: plan.screenShareEnabled,
            broadcastEnabled: plan.broadcastEnabled,
        },
        subscription: sub
            ? {
                status: sub.status,
                currentPeriodEnd: sub.currentPeriodEnd,
                cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                razorpaySubscriptionId: sub.razorpaySubscriptionId,
                planId: sub.planId,
            }
            : null,
        pendingPlan: sub?.pendingPlan
            ? {
                id: sub.pendingPlan.id,
                tier: sub.pendingPlan.tier,
                name: sub.pendingPlan.name,
                priceInPaiseINR: sub.pendingPlan.priceInPaiseINR,
                billingPeriod: sub.pendingPlan.billingPeriod,
                shortUrl: sub.pendingShortUrl,
            }
            : null,
    });
});

// List the user's invoices (most recent first).
billingRouter.get("/invoices", userMiddleware, async (req, res) => {
    const sub = await client.subscription.findUnique({
        where: { ownerId: req.userId! },
        select: { id: true },
    });
    if (!sub) {
        res.json({ invoices: [] });
        return;
    }
    const invoices = await client.invoice.findMany({
        where: { subscriptionId: sub.id },
        orderBy: { createdAt: "desc" },
        take: 20,
    });
    res.json({
        invoices: invoices.map((i) => ({
            id: i.id,
            amountInPaise: i.amountInPaise,
            currency: i.currency,
            status: i.status,
            paidAt: i.paidAt,
            createdAt: i.createdAt,
        })),
    });
});

// Cancel a pending checkout, or cancel an active subscription at period end.
billingRouter.post("/cancel", userMiddleware, async (req, res) => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        res.status(503).json({ message: "Razorpay not configured. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET." });
        return;
    }

    const sub = await client.subscription.findUnique({ where: { ownerId: req.userId! } });
    if (!sub) {
        res.status(400).json({ message: "No subscription to cancel" });
        return;
    }

    const reason = typeof req.body?.reason === "string" && req.body.reason.trim()
        ? req.body.reason.trim()
        : undefined;
    if (reason) console.log(`[billing] cancel reason (user ${req.userId}): ${reason}`);
    const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    try {
        // Cancel a pending checkout first (user hasn't paid yet).
        if (sub.pendingRazorpaySubscriptionId) {
            const resp = await fetch(`${RAZORPAY_API}/subscriptions/${sub.pendingRazorpaySubscriptionId}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: auth },
                body: JSON.stringify({ cancel_at_cycle_end: false }),
            });
            if (!resp.ok) {
                const errText = await resp.text();
                console.error("[billing] Razorpay cancel pending failed:", resp.status, errText);
                res.status(502).json({ message: "Failed to cancel pending checkout with Razorpay" });
                return;
            }
            await client.subscription.update({
                where: { id: sub.id },
                data: {
                    pendingPlanId: null,
                    pendingRazorpaySubscriptionId: null,
                    pendingShortUrl: null,
                },
            });
            invalidatePlanCache(req.userId!);
            res.json({ message: "Checkout cancelled" });
            return;
        }

        if (!sub.razorpaySubscriptionId) {
            res.status(400).json({ message: "No Razorpay subscription to cancel" });
            return;
        }
        if (!["TRIALING", "ACTIVE", "PAST_DUE"].includes(sub.status)) {
            res.status(409).json({ message: "Subscription is already cancelled or expired" });
            return;
        }

        const immediate = sub.status === "TRIALING";
        const resp = await fetch(`${RAZORPAY_API}/subscriptions/${sub.razorpaySubscriptionId}/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({ cancel_at_cycle_end: !immediate }),
        });
        if (!resp.ok) {
            const errText = await resp.text();
            console.error("[billing] Razorpay cancel failed:", resp.status, errText);
            res.status(502).json({ message: "Failed to cancel subscription with Razorpay" });
            return;
        }
        await client.subscription.update({
            where: { id: sub.id },
            data: {
                cancelAtPeriodEnd: !immediate,
                ...(immediate ? { status: "CANCELED" } : {}),
            },
        });
        invalidatePlanCache(req.userId!);
        res.json({
            message: immediate
                ? "Subscription cancelled"
                : "Subscription will cancel at the end of the current period",
        });
    } catch (err) {
        console.error("[billing] cancel error:", err);
        res.status(500).json({ message: "Failed to cancel subscription" });
    }
});

/**
 * Create a Razorpay subscription for the user.
 *
 * NOTE: this route intentionally uses `userMiddleware` (Bearer session) — it is
 * called by the logged-in user. The WEBHOOK route below deliberately has NO
 * session middleware; Razorpay's servers hit it directly with no user session,
 * and it authenticates solely via the Razorpay signature. Do not add
 * userMiddleware/adminMiddleware to `/billing/webhook` — it would 401 the
 * webhook before signature verification ever runs.
 */
billingRouter.post("/subscribe", userMiddleware, async (req, res) => {
    const { planId } = req.body;
    if (!planId || typeof planId !== "string") {
        res.status(400).json({ message: "planId required" });
        return;
    }

    // Serialize per-user: prevents two rapid clicks from creating two Razorpay
    // subscriptions (a real double-charge risk).
    if (subscribeInFlight.has(req.userId!)) {
        res.status(429).json({ message: "A subscription change is already in progress. Please wait a moment." });
        return;
    }
    subscribeInFlight.add(req.userId!);

    try {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
            res.status(503).json({
                message: "Razorpay not configured. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.",
                url: null,
            });
            return;
        }

        const plan = await client.plan.findUnique({ where: { id: planId } });
        if (!plan) {
            res.status(404).json({ message: "Plan not found" });
            return;
        }
        if (plan.tier === "FREE") {
            res.status(400).json({ message: "The Free plan doesn't need checkout — you're already on it." });
            return;
        }
        if (!plan.razorpayPlanId) {
            res.status(400).json({
                message: `Plan ${plan.tier} has no Razorpay plan id configured (set Plan.razorpayPlanId)`,
            });
            return;
        }

        // Switching plans: if the user has a live subscription on a DIFFERENT plan,
        // cancel the old one, then start the new one.
        const existing = await client.subscription.findUnique({
            where: { ownerId: req.userId! },
        });
        if (existing && existing.planId === plan.id && ["ACTIVE", "PAST_DUE"].includes(existing.status)) {
            res.status(409).json({ message: "You already have an active subscription for this plan" });
            return;
        }
        if (existing?.pendingPlanId === plan.id) {
            res.status(409).json({ message: "You already have a pending checkout for this plan" });
            return;
        }

        // Cancel an abandoned pending checkout so we don't leave orphan Razorpay subs.
        if (existing?.pendingRazorpaySubscriptionId) {
            await cancelRazorpay(existing.pendingRazorpaySubscriptionId, false);
        }

        // ACTIVE/PAST_DUE: cancel old Razorpay sub at period end so the customer
        // keeps paid access until the new plan is confirmed by payment.
        const switching = Boolean(
            existing?.razorpaySubscriptionId &&
            existing.planId !== plan.id &&
            ["ACTIVE", "PAST_DUE"].includes(existing.status)
        );
        if (switching) {
            await cancelRazorpay(existing!.razorpaySubscriptionId!, true);
        }

        try {
            const rzSub = await createRazorpaySubscription(plan, req.userId!);

            // For a brand-new user, keep the current plan as FREE until payment confirms.
            const freePlan = await client.plan.findFirst({
                where: { tier: "FREE", billingPeriod: "monthly" },
            });

            const sub = await client.subscription.upsert({
                where: { ownerId: req.userId! },
                create: {
                    ownerId: req.userId!,
                    planId: freePlan?.id ?? plan.id,
                    razorpaySubscriptionId: null,
                    status: "EXPIRED",
                    pendingPlanId: plan.id,
                    pendingRazorpaySubscriptionId: rzSub.id,
                    pendingShortUrl: rzSub.short_url ?? null,
                },
                update: {
                    pendingPlanId: plan.id,
                    pendingRazorpaySubscriptionId: rzSub.id,
                    pendingShortUrl: rzSub.short_url ?? null,
                    // Do not touch planId/status — current plan stays active until webhook confirms payment.
                },
            });

            res.json({
                subscriptionId: rzSub.id,
                shortUrl: rzSub.short_url ?? null,
                localSubscriptionId: sub.id,
                pendingPlan: { tier: plan.tier, name: plan.name },
                switchedFrom: switching ? existing!.planId : undefined,
            });
        } catch (err) {
            console.error("[billing] subscribe error:", err);
            res.status(500).json({ message: "Failed to start subscription" });
        }
    } finally {
        subscribeInFlight.delete(req.userId!);
    }
});

/**
 * Verify a pending checkout by asking Razorpay directly (GET /subscriptions/:id).
 *
 * Called by the frontend right after the checkout modal reports success (with
 * the razorpay_payment_id from the handler) and when returning from the hosted
 * page. This makes the plan activate immediately after payment EVEN IF the
 * webhook is delayed or not configured — the webhook stays the async backup.
 */
billingRouter.post("/verify", userMiddleware, async (req, res) => {
    const auth = razorpayAuth();
    if (!auth) {
        res.status(503).json({ message: "Razorpay not configured. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET." });
        return;
    }

    const sub = await client.subscription.findUnique({
        where: { ownerId: req.userId! },
        include: { pendingPlan: true },
    });
    if (!sub) {
        res.status(400).json({ message: "No subscription found" });
        return;
    }

    // Webhook already flipped the plan before verify ran — nothing to do.
    if (!sub.pendingRazorpaySubscriptionId) {
        res.json({ verified: sub.status === "ACTIVE", activated: false, status: sub.status });
        return;
    }

    const rzId = sub.pendingRazorpaySubscriptionId;
    try {
        const resp = await fetch(`${RAZORPAY_API}/subscriptions/${rzId}`, {
            headers: { Authorization: auth },
        });
        if (!resp.ok) {
            const errText = await resp.text();
            console.error("[billing] verify: fetch subscription failed:", resp.status, errText);
            res.status(502).json({ message: "Couldn't verify payment with Razorpay" });
            return;
        }
        const rz = (await resp.json()) as {
            status?: string;
            current_start?: number | null;
            current_end?: number | null;
        };

        // The checkout handler gives us the payment id — record the invoice now
        // (idempotent) instead of waiting for the subscription.charged webhook.
        const paymentId = typeof req.body?.paymentId === "string" ? req.body.paymentId : null;
        if (paymentId) {
            try {
                const payResp = await fetch(`${RAZORPAY_API}/payments/${paymentId}`, {
                    headers: { Authorization: auth },
                });
                if (payResp.ok) {
                    const pay = (await payResp.json()) as {
                        status?: string;
                        id?: string;
                        amount?: number;
                        currency?: string;
                        created_at?: number | null;
                    };
                    if (pay.status === "captured") {
                        await recordInvoice(sub.id, pay, "paid");
                    }
                }
            } catch (err) {
                console.warn("[billing] verify: fetch payment error:", err);
            }
        }

        if (rz.status === "active") {
            const activated = await activatePendingPlan(sub, fromEpoch(rz.current_start), fromEpoch(rz.current_end));
            invalidatePlanCache(req.userId!);
            if (!activated) {
                res.status(409).json({ message: "Subscription is active on Razorpay but no pending plan was found — contact support to activate your plan." });
                return;
            }
            res.json({ verified: true, activated: true });
            return;
        }

        // Checkout is dead on Razorpay's side — clear the local pending state.
        if (["cancelled", "expired", "halted", "completed"].includes(rz.status ?? "")) {
            await client.subscription.update({
                where: { id: sub.id },
                data: { pendingPlanId: null, pendingRazorpaySubscriptionId: null, pendingShortUrl: null },
            });
            invalidatePlanCache(req.userId!);
            res.json({ verified: true, activated: false, cleared: true, status: rz.status });
            return;
        }

        // created / authenticated / pending — customer hasn't paid yet.
        res.json({ verified: false, activated: false, status: rz.status ?? "unknown" });
    } catch (err) {
        console.error("[billing] verify error:", err);
        res.status(500).json({ message: "Failed to verify payment" });
    }
});

/**
 * Razorpay webhook — the source of truth for subscription state.
 *
 * Authentication is the Razorpay HMAC-SHA256 signature only. Invalid or
 * unsigned requests get a 400 (NOT 200) so Razorpay retries legitimate ones.
 * Idempotency comes from the unique constraints on Invoice.razorpayPaymentId /
 * razorpayInvoiceId and upsert-style checks.
 */
billingRouter.post("/webhook", async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        res.status(503).json({ message: "Razorpay webhook secret not configured" });
        return;
    }

    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const raw = req.rawBody;
    if (!signature || !raw) {
        res.status(400).json({ message: "Missing signature or body" });
        return;
    }

    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        console.warn("[billing] invalid webhook signature");
        res.status(400).json({ message: "Invalid signature" });
        return;
    }

    let payload: {
        event?: string;
        payload?: {
            subscription?: { entity?: { id?: string; current_start?: number | null; current_end?: number | null } };
            payment?: { entity?: { id?: string; subscription_id?: string; amount?: number; currency?: string; created_at?: number | null } };
            invoice?: { entity?: { id?: string } };
        };
    };
    try {
        payload = JSON.parse(raw.toString());
    } catch {
        console.warn("[billing] webhook: malformed JSON body");
        res.status(400).json({ message: "Malformed JSON" });
        return;
    }

    const event = payload.event;
    const rzSub = payload.payload?.subscription?.entity;
    const rzSubId = rzSub?.id ?? payload.payload?.payment?.entity?.subscription_id;
    if (!event || !rzSubId) {
        res.json({ received: true });
        return;
    }

    const subscription = await findSubscriptionByRazorpayId(rzSubId);
    if (!subscription) {
        console.warn("[billing] webhook for unknown subscription:", rzSubId);
        res.json({ received: true });
        return;
    }

    const isPending = subscription.pendingRazorpaySubscriptionId === rzSubId;

    try {
        switch (event) {
            case "subscription.activated": {
                if (isPending) {
                    await activatePendingPlan(subscription, fromEpoch(rzSub?.current_start), fromEpoch(rzSub?.current_end));
                } else {
                    await client.subscription.update({
                        where: { id: subscription.id },
                        data: {
                            status: "ACTIVE",
                            graceEndsAt: null,
                            currentPeriodStart: fromEpoch(rzSub?.current_start) ?? subscription.currentPeriodStart,
                            currentPeriodEnd: fromEpoch(rzSub?.current_end) ?? subscription.currentPeriodEnd,
                        },
                    });
                }
                break;
            }

            case "subscription.charged": {
                const payment = payload.payload?.payment?.entity;
                const invoiceEntity = payload.payload?.invoice?.entity;
                await recordInvoice(subscription.id, payment, "paid", invoiceEntity?.id);
                if (isPending) {
                    await activatePendingPlan(subscription, fromEpoch(rzSub?.current_start), fromEpoch(rzSub?.current_end));
                } else {
                    await client.subscription.update({
                        where: { id: subscription.id },
                        data: {
                            status: "ACTIVE",
                            graceEndsAt: null,
                            currentPeriodStart: fromEpoch(rzSub?.current_start) ?? subscription.currentPeriodStart,
                            currentPeriodEnd: fromEpoch(rzSub?.current_end) ?? subscription.currentPeriodEnd,
                        },
                    });
                }
                break;
            }

            // Payment events for subscription charges (used when the dashboard
            // subscribes to payment events instead of subscription events).
            case "payment.captured":
            case "payment.authorized": {
                const payment = payload.payload?.payment?.entity;
                if (payment?.subscription_id === rzSubId) {
                    await recordInvoice(subscription.id, payment, "paid", payload.payload?.invoice?.entity?.id);
                    if (isPending) {
                        await activatePendingPlan(subscription, fromEpoch(rzSub?.current_start), fromEpoch(rzSub?.current_end));
                    } else {
                        await client.subscription.update({
                            where: { id: subscription.id },
                            data: { status: "ACTIVE", graceEndsAt: null },
                        });
                    }
                }
                break;
            }

            case "payment.failed": {
                const payment = payload.payload?.payment?.entity;
                await recordInvoice(subscription.id, payment, "failed");
                if (isPending) {
                    // Checkout failed before payment — clear the pending plan but leave current plan untouched.
                    await client.subscription.update({
                        where: { id: subscription.id },
                        data: {
                            pendingPlanId: null,
                            pendingRazorpaySubscriptionId: null,
                            pendingShortUrl: null,
                        },
                    });
                } else {
                    await client.subscription.update({
                        where: { id: subscription.id },
                        data: {
                            status: "PAST_DUE",
                            graceEndsAt: new Date(Date.now() + GRACE_DAYS_MS),
                        },
                    });
                    if (subscription.owner.email) {
                        await sendEmail(
                            subscription.owner.email,
                            "Payment failed — action needed",
                            `<p>Hi ${subscription.owner.name},</p>` +
                                `<p>Your payment failed. Update your payment method within ${GRACE_DAYS} days, or your plan will be downgraded to Free.</p>` +
                                `<p><a href="${process.env.APP_URL ?? "http://localhost:5173"}/billing">Manage billing</a></p>`
                        );
                    }
                }
                break;
            }

            case "invoice.paid": {
                const payment = payload.payload?.payment?.entity;
                await recordInvoice(subscription.id, payment, "paid", payload.payload?.invoice?.entity?.id);
                break;
            }

            case "invoice.payment_failed": {
                const payment = payload.payload?.payment?.entity;
                await recordInvoice(subscription.id, payment, "failed");
                if (!isPending) {
                    await client.subscription.update({
                        where: { id: subscription.id },
                        data: {
                            status: "PAST_DUE",
                            graceEndsAt: new Date(Date.now() + GRACE_DAYS_MS),
                        },
                    });
                }
                break;
            }

            case "subscription.cancelled": {
                if (isPending) {
                    await client.subscription.update({
                        where: { id: subscription.id },
                        data: {
                            pendingPlanId: null,
                            pendingRazorpaySubscriptionId: null,
                            pendingShortUrl: null,
                        },
                    });
                } else {
                    await client.subscription.update({
                        where: { id: subscription.id },
                        data: { status: "CANCELED" },
                    });
                }
                break;
            }

            case "subscription.halted": {
                if (isPending) {
                    await client.subscription.update({
                        where: { id: subscription.id },
                        data: {
                            pendingPlanId: null,
                            pendingRazorpaySubscriptionId: null,
                            pendingShortUrl: null,
                        },
                    });
                } else {
                    // Payment failed repeatedly — stop charging, drop to Free.
                    await client.subscription.update({
                        where: { id: subscription.id },
                        data: { status: "EXPIRED" },
                    });
                }
                break;
            }

            case "subscription.completed": {
                // A finite subscription (total_count=12) reached its last cycle.
                // Should only apply to active subscriptions, not pending checkouts.
                if (isPending) break;
                let renewed = false;
                if (subscription.plan.tier !== "FREE" && subscription.plan.razorpayPlanId) {
                    try {
                        const rz = await createRazorpaySubscription(subscription.plan, subscription.ownerId);
                        await client.subscription.update({
                            where: { id: subscription.id },
                            data: {
                                razorpaySubscriptionId: rz.id,
                                status: "TRIALING",
                                cancelAtPeriodEnd: false,
                                graceEndsAt: null,
                            },
                        });
                        if (subscription.owner.email && rz.short_url) {
                            await sendEmail(
                                subscription.owner.email,
                                "Renew your plan",
                                `<p>Hi ${subscription.owner.name},</p>` +
                                    `<p>Your plan period ended — renew here to keep your paid features:</p>` +
                                    `<p><a href="${rz.short_url}">${rz.short_url}</a></p>`
                            );
                        }
                        renewed = true;
                    } catch (err) {
                        console.error("[billing] renewal failed:", err);
                    }
                }
                if (!renewed) {
                    await client.subscription.update({
                        where: { id: subscription.id },
                        data: { status: "EXPIRED" },
                    });
                }
                break;
            }

            // Events we intentionally ignore (checkout not paid yet, etc.).
            case "subscription.pending":
            case "subscription.authenticated":
            case "subscription.updated":
                break;

            default:
                console.warn("[billing] unhandled webhook event:", event);
                break;
        }
    } catch (err) {
        console.error("[billing] webhook processing error for", event, ":", err);
        // Do NOT ack a processing failure — Razorpay retries the event.
        res.status(500).json({ message: "Webhook processing failed" });
        return;
    }

    // Plan gating reads a 60s-cached effective plan; clear it so the new
    // status (and plan limits) take effect immediately.
    invalidatePlanCache(subscription.ownerId);

    res.json({ received: true });
});