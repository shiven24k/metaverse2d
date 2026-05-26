import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import client from "@repo/db/client";

export const collectionRouter = Router();

collectionRouter.get("/", userMiddleware, async (req, res) => {
    const items = await client.item.findMany({
        orderBy: [{ category: "asc" }, { rarity: "asc" }],
    });

    const owned = await client.inventoryItem.findMany({
        where: { userId: req.userId, quantity: { gt: 0 } },
    });
    const ownedSet = new Set(owned.map(i => i.itemId));

    res.json({
        collection: items.map(item => ({
            id: item.id,
            name: item.name,
            category: item.category,
            rarity: item.rarity,
            imageUrl: item.imageUrl,
            owned: ownedSet.has(item.id),
        })),
    });
});
