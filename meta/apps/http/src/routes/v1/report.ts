import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import { adminMiddleware } from "../../middleware/admin";
import client from "@repo/db/client";

export const reportRouter = Router();

reportRouter.post("/", userMiddleware, async (req, res) => {
    const { targetUserId, targetMessageId, reason } = req.body;
    if (!reason || (!targetUserId && !targetMessageId)) {
        res.status(400).json({ message: "reason and targetUserId or targetMessageId required" });
        return;
    }

    const report = await client.report.create({
        data: {
            reporterId: req.userId!,
            targetUserId: targetUserId ?? null,
            targetMessageId: targetMessageId ?? null,
            reason,
        },
    });

    res.json({ id: report.id, message: "Report submitted" });
});

reportRouter.get("/", adminMiddleware, async (req, res) => {
    const reports = await client.report.findMany({
        where: { resolved: false },
        include: {
            reporter: { select: { id: true, username: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
    });

    res.json({ reports });
});
