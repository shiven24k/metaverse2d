import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import client from "@repo/db/client";

export const guestbookRouter = Router();

guestbookRouter.get("/:spaceId", async (req, res) => {
    const messages = await client.guestbookEntry.findMany({
        where: { spaceId: req.params.spaceId },
        include: {
            user: { select: { id: true, username: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
    });

    res.json({
        messages: messages.map(m => ({
            id: m.id,
            userId: m.userId,
            username: m.user.username ?? m.user.name,
            message: m.message,
            createdAt: m.createdAt,
        })),
    });
});

guestbookRouter.post("/:spaceId", userMiddleware, async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== "string" || message.length > 200) {
        res.status(400).json({ message: "Message must be 1-200 characters" });
        return;
    }

    const space = await client.space.findUnique({
        where: { id: req.params.spaceId },
    });
    if (!space) {
        res.status(404).json({ message: "Space not found" });
        return;
    }

    const entry = await client.guestbookEntry.create({
        data: {
            spaceId: req.params.spaceId,
            userId: req.userId!,
            message: message.trim(),
        },
    });

    res.json({ id: entry.id, message: entry.message, createdAt: entry.createdAt });
});

guestbookRouter.delete("/:id", userMiddleware, async (req, res) => {
    const entry = await client.guestbookEntry.findUnique({
        where: { id: req.params.id },
        include: { space: { select: { creatorId: true } } },
    });

    if (!entry) {
        res.status(404).json({ message: "Entry not found" });
        return;
    }

    if (entry.userId !== req.userId && entry.space.creatorId !== req.userId) {
        res.status(403).json({ message: "Unauthorized" });
        return;
    }

    await client.guestbookEntry.delete({ where: { id: req.params.id } });
    res.json({ message: "Entry deleted" });
});
