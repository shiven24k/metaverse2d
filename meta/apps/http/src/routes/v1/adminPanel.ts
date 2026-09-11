import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import { requirePlatformAdmin } from "../../middleware/requirePlatformAdmin";
import { invalidatePlanCache } from "../../../../ws/src/lib/planAccess";
import { getRoomManager } from "../../../../ws/src/getRoomManager";
import client from "@repo/db/client";

/**
 * Platform-admin panel (MVP, Phase 1 per the billing plan).
 * Everything here is gated by userMiddleware (to resolve the session) +
 * requirePlatformAdmin (global SaaS admin role).
 * Kept as plain tables/forms — correctness of write actions matters, not polish.
 */
export const adminPanelRouter = Router();
adminPanelRouter.use(userMiddleware, requirePlatformAdmin);

const VALID_STATUS = new Set(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"]);

// Revenue + system snapshot: MRR, counts by tier/status, live room usage.
adminPanelRouter.get("/panel/summary", async (req, res) => {
    const [userCount, adminCount, spaceCount, activeSubs, subsByStatus] = await Promise.all([
        client.user.count(),
        client.user.count({ where: { platformRole: "PLATFORM_ADMIN" } }),
        client.space.count(),
        client.subscription.findMany({ where: { status: "ACTIVE" }, include: { plan: true } }),
        client.subscription.groupBy({ by: ["status"], _count: true }),
    ]);

    // MRR in paise: yearly plans are converted to a monthly-equivalent.
    const mrrPaise = activeSubs.reduce(
        (sum, s) => sum + (s.plan.billingPeriod === "yearly" ? Math.round(s.plan.priceInPaiseINR / 12) : s.plan.priceInPaiseINR),
        0
    );

    const failedInvoices = await client.invoice.count({ where: { status: "failed" } });

    let liveRooms = 0;
    let liveUsers = 0;
    try {
        const rooms = getRoomManager().rooms;
        liveRooms = rooms.size;
        for (const [, users] of rooms) liveUsers += users.length;
    } catch {
        // WS not running in this process (e.g. tests)
    }

    res.json({
        userCount,
        adminCount,
        spaceCount,
        mrrPaise,
        activeSubscriptionCount: activeSubs.length,
        subsByStatus: Object.fromEntries(subsByStatus.map((s) => [s.status, s._count])),
        failedInvoices,
        liveRooms,
        liveUsers,
    });
});

// Users: search by name/username/email, newest first.
adminPanelRouter.get("/panel/users", async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const where = search
        ? {
              OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { username: { contains: search, mode: "insensitive" as const } },
                  { email: { contains: search, mode: "insensitive" as const } },
              ],
          }
        : {};
    const users = await client.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
            id: true,
            name: true,
            username: true,
            email: true,
            platformRole: true,
            role: true,
            createdAt: true,
            subscription: { select: { status: true, plan: { select: { tier: true } } } },
        },
    });
    res.json({ users });
});

// Subscriptions: filter by status, newest updated first.
adminPanelRouter.get("/panel/subscriptions", async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const where = status && VALID_STATUS.has(status) ? { status } : {};
    const subscriptions = await client.subscription.findMany({
        where,
        include: {
            owner: { select: { name: true, username: true, email: true } },
            plan: { select: { tier: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
    });
    res.json({ subscriptions });
});

// Manual plan/status override — writes an AdminAuditLog and clears the plan cache.
adminPanelRouter.post("/panel/subscriptions/:id/override", async (req, res) => {
    const { planId, status } = req.body as { planId?: string; status?: string };
    if (planId === undefined && status === undefined) {
        res.status(400).json({ message: "Provide planId and/or status" });
        return;
    }
    if (status !== undefined && !VALID_STATUS.has(status)) {
        res.status(400).json({ message: `status must be one of ${[...VALID_STATUS].join(", ")}` });
        return;
    }
    if (planId !== undefined) {
        const plan = await client.plan.findUnique({ where: { id: planId } });
        if (!plan) {
            res.status(404).json({ message: "Plan not found" });
            return;
        }
    }

    const sub = await client.subscription.findUnique({ where: { id: req.params.id }, include: { owner: true } });
    if (!sub) {
        res.status(404).json({ message: "Subscription not found" });
        return;
    }

    const data: { planId?: string; status?: string } = {};
    if (planId !== undefined) data.planId = planId;
    if (status !== undefined) data.status = status;

    const updated = await client.$transaction(async (tx) => {
        const s = await tx.subscription.update({ where: { id: sub.id }, data });
        await tx.adminAuditLog.create({
            data: {
                adminId: req.userId!,
                action: "SUBSCRIPTION_OVERRIDE",
                targetType: "SUBSCRIPTION",
                targetId: sub.id,
                metadata: { before: { planId: sub.planId, status: sub.status }, after: data },
            },
        });
        return s;
    });

    invalidatePlanCache(sub.ownerId);
    res.json({ subscription: updated });
});

// Invoices, newest first (optional status filter).
adminPanelRouter.get("/panel/invoices", async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const where = status ? { status } : {};
    const invoices = await client.invoice.findMany({
        where,
        include: {
            subscription: { include: { owner: { select: { name: true, username: true, email: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    res.json({ invoices });
});

// Spaces with creator + content/member counts.
adminPanelRouter.get("/panel/spaces", async (req, res) => {
    const spaces = await client.space.findMany({
        include: {
            creator: { select: { name: true, username: true } },
            _count: { select: { members: true, elements: true, placedItems: true, npcs: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    res.json({ spaces });
});

// Admin audit trail.
adminPanelRouter.get("/panel/audit", async (req, res) => {
    const logs = await client.adminAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    res.json({ logs });
});