import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import client from "@repo/db/client";

export const shopRouter = Router();

shopRouter.get("/daily", async (req, res) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const seed = today.toISOString().slice(0, 10);
    const seedNum = seed.split("-").reduce((a, b) => a + parseInt(b), 0);

    const allItems = await client.item.findMany();
    const shuffled = allItems.sort((a, b) => {
        const ha = (seedNum * a.id.charCodeAt(0)) % 1000;
        const hb = (seedNum * b.id.charCodeAt(0)) % 1000;
        return ha - hb;
    });
    const dailyItems = shuffled.slice(0, 3);

    res.json({
        items: dailyItems.map(i => ({
            id: i.id,
            name: i.name,
            category: i.category,
            rarity: i.rarity,
            imageUrl: i.imageUrl,
            width: i.width,
            height: i.height,
        })),
        refreshedAt: today.toISOString(),
    });
});

shopRouter.post("/buy", userMiddleware, async (req, res) => {
    const { itemId } = req.body;
    if (!itemId) {
        res.status(400).json({ message: "itemId is required" });
        return;
    }

    const item = await client.item.findUnique({
        where: { id: itemId },
    });
    if (!item) {
        res.status(404).json({ message: "Item not found" });
        return;
    }

    let wallet = await client.wallet.findUnique({
        where: { userId: req.userId },
    });
    if (!wallet) {
        wallet = await client.wallet.create({
            data: { userId: req.userId! },
        });
    }

    const price = item.rarity === "Common" ? 50 : item.rarity === "Uncommon" ? 150 : item.rarity === "Rare" ? 500 : 100;

    if (wallet.coins < price) {
        res.status(400).json({ message: "Not enough coins" });
        return;
    }

    await client.$transaction(async (tx) => {
        await tx.wallet.update({
            where: { userId: req.userId },
            data: { coins: { decrement: price } },
        });
        await tx.inventoryItem.upsert({
            where: {
                userId_itemId: { userId: req.userId!, itemId },
            },
            create: { userId: req.userId!, itemId, quantity: 1 },
            update: { quantity: { increment: 1 } },
        });
    });

    res.json({ message: "Item purchased", itemId, price });
});
