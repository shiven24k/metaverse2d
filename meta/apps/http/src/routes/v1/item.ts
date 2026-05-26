import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import client from "@repo/db/client";

export const itemRouter = Router();

itemRouter.get("/", async (req, res) => {
    const items = await client.item.findMany({
        orderBy: { createdAt: "desc" },
    });
    res.json({
        items: items.map(i => ({
            id: i.id,
            name: i.name,
            category: i.category,
            rarity: i.rarity,
            imageUrl: i.imageUrl,
            width: i.width,
            height: i.height,
            isWallItem: i.isWallItem,
            season: i.season,
        })),
    });
});

export const inventoryRouter = Router();

inventoryRouter.get("/", userMiddleware, async (req, res) => {
    const inventory = await client.inventoryItem.findMany({
        where: { userId: req.userId },
        include: { item: true },
    });
    res.json({
        inventory: inventory.map(i => ({
            id: i.id,
            itemId: i.itemId,
            name: i.item.name,
            category: i.item.category,
            rarity: i.item.rarity,
            imageUrl: i.item.imageUrl,
            width: i.item.width,
            height: i.item.height,
            quantity: i.quantity,
        })),
    });
});

inventoryRouter.post("/demo", userMiddleware, async (req, res) => {
    const items = await client.item.findMany();
    for (const item of items) {
        await client.inventoryItem.upsert({
            where: { userId_itemId: { userId: req.userId!, itemId: item.id } },
            create: { userId: req.userId!, itemId: item.id, quantity: 2 },
            update: { quantity: { increment: 2 } },
        });
    }
    res.json({ message: "Demo items added" });
});
