import { Router } from "express";
import { adminMiddleware } from "../../middleware/admin";
import client from "@repo/db/client";

export const adminBanRouter = Router();
adminBanRouter.use(adminMiddleware);

adminBanRouter.post("/ban/:userId", async (req, res) => {
    const { reason } = req.body;

    const user = await client.user.findUnique({
        where: { id: req.params.userId },
    });
    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }

    const banned = await client.bannedUser.upsert({
        where: { userId: req.params.userId },
        create: {
            userId: req.params.userId,
            reason: reason ?? "No reason provided",
        },
        update: {
            reason: reason ?? "No reason provided",
        },
    });

    res.json({ message: "User banned", id: banned.id });
});

adminBanRouter.post("/unban/:userId", async (req, res) => {
    await client.bannedUser.deleteMany({
        where: { userId: req.params.userId },
    });
    res.json({ message: "User unbanned" });
});
