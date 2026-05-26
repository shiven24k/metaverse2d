import { Router } from "express";
import client from "@repo/db/client";

export const playerRouter = Router();

playerRouter.get("/:userId", async (req, res) => {
    const user = await client.user.findUnique({
        where: { id: req.params.userId },
        include: {
            avatar: { select: { id: true, imageUrl: true, name: true } },
            _count: { select: { spaces: true } },
        },
    });

    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }

    res.json({
        id: user.id,
        username: user.username ?? user.name,
        displayUsername: user.displayUsername,
        avatar: user.avatar ?? null,
        spaceCount: user._count.spaces,
        createdAt: user.createdAt,
    });
});
