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
        select: {
            status: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            razorpaySubscriptionId: true,
            planId: true,
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
        subscription: sub ?? null,
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

// Cancel at period end (self-service). TRIALING subscriptions cancel immediately.
billingRouter.post("/cancel", userMiddleware, async (req, res) => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        res.status(503).json({ message: "Razorpay not configured. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET." });
        return;
    }

    const sub = await client.subscription.findUnique({ where: { ownerId: req.userId! } });
    if (!sub?.razorpaySubscriptionId) {
        res.status(400).json({ message: "No Razorpay subscription to cancel" });
        return;
    }

    const immediate = sub.status === "TRIALING";
    const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    try {
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
            data: { cancelAtPeriodEnd: !immediate },
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
    if (!plan.razorpayPlanId) {
        res.status(400).json({
            message: `Plan ${plan.tier} has no Razorpay plan id configured (set Plan.razorpayPlanId)`,
        });
        return;
    }

    // Don't create a duplicate live subscription for an already-active plan.
    const existing = await client.subscription.findUnique({
        where: { ownerId: req.userId! },
    });
    if (existing?.status === "ACTIVE") {
        res.status(409).json({ message: "You already have an active subscription" });
        return;
    }

    const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    // Charge cycles: yearly = 1 upfront charge; monthly = 12 auto-charges (then
    // the subscription completes). Long-running recurring plans should handle
    // `subscription.completed` by creating a renewal, or use a large total_count.
    const totalCount = plan.billingPeriod === "yearly" ? 1 : 12;

    try {
        const resp = await fetch(`${RAZORPAY_API}/subscriptions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({
                plan_id: plan.razorpayPlanId,
                customer_notify: 1,
                total_count: totalCount,
                notes: { planId: plan.id, ownerId: req.userId },
            }),
        });

        if (!resp.ok) {
            const errText = await resp.text();
            console.error("[billing] Razorpay create subscription failed:", resp.status, errText);
            res.status(502).json({ message: "Failed to create subscription with Razorpay" });
            return;
        }

        const rzSub = (await resp.json()) as {
            id: string;
            short_url?: string | null;
            status?: string;
        };

        const sub = await client.subscription.upsert({
            where: { ownerId: req.userId! },
            create: {
                ownerId: req.userId!,
                planId: plan.id,
                razorpaySubscriptionId: rzSub.id,
                status: "TRIALING",
            },
            update: {
                planId: plan.id,
                razorpaySubscriptionId: rzSub.id,
                graceEndsAt: null,
            },
        });

        res.json({
            subscriptionId: rzSub.id,
            shortUrl: rzSub.short_url ?? null,
            localSubscriptionId: sub.id,
            plan: { tier: plan.tier, name: plan.name },
        });
    } catch (err) {
        console.error("[billing] subscribe error:", err);
        res.status(500).json({ message: "Failed to start subscription" });
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
    if (signature !== expected) {
        console.warn("[billing] invalid webhook signature");
        res.status(400).json({ message: "Invalid signature" });
        return;
    }

    const payload = JSON.parse(raw.toString()) as {
        event?: string;
        payload?: {
            subscription?: { entity?: { id?: string; current_start?: number | null; current_end?: number | null } };
            payment?: { entity?: { id?: string; amount?: number; currency?: string; created_at?: number | null } };
            invoice?: { entity?: { id?: string } };
        };
    };

    const event = payload.event;
    const rzSub = payload.payload?.subscription?.entity;
    if (!event || !rzSub?.id) {
        res.json({ received: true });
        return;
    }

    const subscription = await client.subscription.findUnique({
        where: { razorpaySubscriptionId: rzSub.id },
        include: { plan: true, owner: { select: { email: true, name: true } } },
    });
    if (!subscription) {
        console.warn("[billing] webhook for unknown subscription:", rzSub.id);
        res.json({ received: true });
        return;
    }

    const fromEpoch = (s?: number | null): Date | null => (s ? new Date(s * 1000) : null);

    switch (event) {
        case "subscription.activated": {
            await client.subscription.update({
                where: { id: subscription.id },
                data: {
                    status: "ACTIVE",
                    graceEndsAt: null,
                    currentPeriodStart: fromEpoch(rzSub.current_start) ?? subscription.currentPeriodStart,
                    currentPeriodEnd: fromEpoch(rzSub.current_end) ?? subscription.currentPeriodEnd,
                },
            });
            break;
        }

        case "subscription.charged": {
            const payment = payload.payload?.payment?.entity;
            const paymentId = payment?.id;
            if (paymentId) {
                const existing = await client.invoice.findUnique({
                    where: { razorpayPaymentId: paymentId },
                });
                if (!existing) {
                    await client.invoice.create({
                        data: {
                            subscriptionId: subscription.id,
                            razorpayPaymentId: paymentId,
                            razorpayInvoiceId: payload.payload?.invoice?.entity?.id ?? undefined,
                            amountInPaise: payment?.amount ?? 0,
                            currency: payment?.currency ?? "INR",
                            status: "paid",
                            paidAt: fromEpoch(payment?.created_at),
                        },
                    });
                }
            }
            await client.subscription.update({
                where: { id: subscription.id },
                data: {
                    status: "ACTIVE",
                    graceEndsAt: null,
                    currentPeriodStart: fromEpoch(rzSub.current_start) ?? subscription.currentPeriodStart,
                    currentPeriodEnd: fromEpoch(rzSub.current_end) ?? subscription.currentPeriodEnd,
                },
            });
            break;
        }

        case "payment.failed": {
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
            break;
        }

        case "subscription.cancelled": {
            await client.subscription.update({
                where: { id: subscription.id },
                data: { status: "CANCELED" },
            });
            break;
        }

        case "subscription.halted":
        case "subscription.completed": {
            await client.subscription.update({
                where: { id: subscription.id },
                data: { status: "EXPIRED" },
            });
            break;
        }
    }

    // Plan gating reads a 60s-cached effective plan; clear it so the new
    // status (and plan limits) take effect immediately.
    invalidatePlanCache(subscription.ownerId);

    res.json({ received: true });
});