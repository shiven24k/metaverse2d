import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import client from "@repo/db/client";

export const giftRouter = Router();

giftRouter.get("/status", userMiddleware, async (req, res) => {
    const gift = await client.dailyGift.findUnique({
        where: { userId: req.userId },
    });

    if (!gift) {
        res.json({ claimed: false, nextClaimAt: null });
        return;
    }

    const now = new Date();
    const nextClaim = new Date(gift.lastClaim);
    nextClaim.setUTCDate(nextClaim.getUTCDate() + 1);
    nextClaim.setUTCHours(0, 0, 0, 0);

    if (now >= nextClaim) {
        res.json({ claimed: false, nextClaimAt: null });
        return;
    }

    res.json({ claimed: true, nextClaimAt: nextClaim.toISOString() });
});

giftRouter.post("/claim", userMiddleware, async (req, res) => {
    const now = new Date();

    const existing = await client.dailyGift.findUnique({
        where: { userId: req.userId },
    });

    if (existing) {
        const nextClaim = new Date(existing.lastClaim);
        nextClaim.setUTCDate(nextClaim.getUTCDate() + 1);
        nextClaim.setUTCHours(0, 0, 0, 0);
        if (now < nextClaim) {
            res.status(400).json({ message: "Gift already claimed today" });
            return;
        }
    }

    const commonItems = await client.item.findMany({
        where: { rarity: "Common" },
    });

    let randomItem: typeof commonItems[0] | undefined;
    if (commonItems.length > 0) {
        randomItem = commonItems[Math.floor(Math.random() * commonItems.length)];
    }

    const [gift, milestoneItem] = await client.$transaction(async (tx) => {
        const gift = await tx.dailyGift.upsert({
            where: { userId: req.userId! },
            create: { userId: req.userId!, lastClaim: now, streak: 1 },
            update: {
                lastClaim: now,
                streak: { increment: 1 },
            },
        });

        await tx.wallet.upsert({
            where: { userId: req.userId! },
            create: { userId: req.userId!, coins: 50 },
            update: { coins: { increment: 50 } },
        });

        let milestoneItem = null;

        if (gift.streak === 7 || gift.streak === 14 || gift.streak === 21) {
            milestoneItem = await tx.item.findFirst({
                where: { rarity: "Rare" },
                orderBy: { id: "asc" },
            });
        } else if (gift.streak >= 28 && gift.streak % 28 === 0) {
            milestoneItem = await tx.item.findFirst({
                where: { rarity: "Legacy" },
                orderBy: { id: "asc" },
            });
        }

        if (milestoneItem) {
            await tx.inventoryItem.upsert({
                where: {
                    userId_itemId: { userId: req.userId!, itemId: milestoneItem.id },
                },
                create: { userId: req.userId!, itemId: milestoneItem.id, quantity: 1 },
                update: { quantity: { increment: 1 } },
            });
        }

        if (randomItem) {
            await tx.inventoryItem.upsert({
                where: {
                    userId_itemId: { userId: req.userId!, itemId: randomItem.id },
                },
                create: { userId: req.userId!, itemId: randomItem.id, quantity: 1 },
                update: { quantity: { increment: 1 } },
            });
        }

        return [gift, milestoneItem] as const;
    });

    res.json({
        coins: 50,
        item: randomItem ? { id: randomItem.id, name: randomItem.name } : null,
        milestone: milestoneItem ? { id: milestoneItem.id, name: milestoneItem.name, rarity: milestoneItem.rarity } : null,
        streak: gift.streak,
    });
});

giftRouter.post("/send", userMiddleware, async (req, res) => {
    const { itemId, recipientId } = req.body;
    if (!itemId || !recipientId) {
        res.status(400).json({ message: "itemId and recipientId required" });
        return;
    }

    if (recipientId === req.userId) {
        res.status(400).json({ message: "Cannot gift to yourself" });
        return;
    }

    const recipient = await client.user.findUnique({ where: { id: recipientId } });
    if (!recipient) {
        res.status(404).json({ message: "Recipient not found" });
        return;
    }

    const inv = await client.inventoryItem.findUnique({
        where: { userId_itemId: { userId: req.userId!, itemId } },
    });
    if (!inv || inv.quantity < 1) {
        res.status(400).json({ message: "You don't own this item" });
        return;
    }

    const item = await client.item.findUnique({ where: { id: itemId } });
    if (!item) {
        res.status(404).json({ message: "Item not found" });
        return;
    }

    await client.$transaction(async (tx) => {
        await tx.inventoryItem.update({
            where: { userId_itemId: { userId: req.userId!, itemId } },
            data: { quantity: { decrement: 1 } },
        });
        await tx.inventoryItem.upsert({
            where: { userId_itemId: { userId: recipientId, itemId } },
            create: { userId: recipientId, itemId, quantity: 1 },
            update: { quantity: { increment: 1 } },
        });
    });

    res.json({ message: `Gifted ${item.name}`, item: { id: item.id, name: item.name } });
});
