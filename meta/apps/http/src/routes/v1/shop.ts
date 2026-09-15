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

    const price = item.rarity === "Common" ? 50 : item.rarity === "Uncommon" ? 150 : item.rarity === "Rare" ? 500 : 100;

    // Atomic buy: the conditional updateMany only decrements when the balance is
    // sufficient, so concurrent buys can't drive coins negative (TOCTOU fix).
    try {
        await client.$transaction(async (tx) => {
            const result = await tx.wallet.updateMany({
                where: { userId: req.userId!, coins: { gte: price } },
                data: { coins: { decrement: price } },
            });
            if (result.count === 0) {
                throw new Error("INSUFFICIENT_FUNDS");
            }
            await tx.inventoryItem.upsert({
                where: {
                    userId_itemId: { userId: req.userId!, itemId },
                },
                create: { userId: req.userId!, itemId, quantity: 1 },
                update: { quantity: { increment: 1 } },
            });
        });
    } catch (err) {
        if (err instanceof Error && err.message === "INSUFFICIENT_FUNDS") {
            res.status(400).json({ message: "Not enough coins" });
            return;
        }
        throw err;
    }

    res.json({ message: "Item purchased", itemId, price });
});
