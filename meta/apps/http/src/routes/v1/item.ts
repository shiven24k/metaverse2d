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
            blocking: i.blocking,
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
            blocking: i.item.blocking,
            quantity: i.quantity,
        })),
    });
});

