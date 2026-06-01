import { Router } from "express";
import { adminMiddleware } from "../../middleware/admin";
import { AddElementSchema, CreateAvatarSchema, CreateElementSchema, CreateItemSchema, CreateMapSchema, UpdateElementSchema } from "../../types";
import client from "@repo/db/client";
export const adminRouter = Router();
adminRouter.use(adminMiddleware)

adminRouter.post("/item", async (req, res) => {
    const parsedData = CreateItemSchema.safeParse(req.body)
    if (!parsedData.success) {
        res.status(400).json({message: "Validation failed", errors: parsedData.error.errors})
        return
    }
    const item = await client.item.create({
        data: {
            name: parsedData.data.name,
            category: parsedData.data.category,
            rarity: parsedData.data.rarity,
            imageUrl: parsedData.data.imageUrl,
            width: parsedData.data.width,
            height: parsedData.data.height,
            isWallItem: parsedData.data.isWallItem ?? false,
            blocking: parsedData.data.blocking ?? true,
            season: parsedData.data.season,
        }
    })
    await client.inventoryItem.upsert({
        where: { userId_itemId: { userId: req.userId!, itemId: item.id } },
        create: { userId: req.userId!, itemId: item.id, quantity: 1 },
        update: { quantity: { increment: 1 } },
    })
    res.json({ id: item.id, name: item.name })
})

adminRouter.post("/element", async (req, res) => {
    const parsedData = CreateElementSchema.safeParse(req.body)
    if (!parsedData.success) {
        res.status(400).json({message: "Validation failed"})
        return
    }

    const element = await client.element.create({
        data: {
            width: parsedData.data.width,
            height: parsedData.data.height,
            static: parsedData.data.static,
            imageUrl: parsedData.data.imageUrl,
            blocking: parsedData.data.blocking ?? true,
        }
    })

    res.json({
        id: element.id
    })
})

adminRouter.put("/element/:elementId", async (req, res) => {
    const parsedData = UpdateElementSchema.safeParse(req.body)
    if (!parsedData.success) {
        res.status(400).json({message: "Validation failed"})
        return
    }
    await client.element.update({
        where: {
            id: req.params.elementId
        },
        data: {
            imageUrl: parsedData.data.imageUrl
        }
    })
    res.json({message: "Element updated"})
})

adminRouter.post("/avatar", async (req, res) => {
    const parsedData = CreateAvatarSchema.safeParse(req.body)
    if (!parsedData.success) {
        res.status(400).json({message: "Validation failed"})
        return
    }
    const avatar = await client.avatar.create({
        data: {
            name: parsedData.data.name,
            imageUrl: parsedData.data.imageUrl
        }
    })
    res.json({avatarId: avatar.id})
})

adminRouter.post("/map", async (req, res) => {
    const parsedData = CreateMapSchema.safeParse(req.body)
    if (!parsedData.success) {
        res.status(400).json({message: "Validation failed"})
        return
    }
    const map = await client.map.create({
        data: {
            name: parsedData.data.name,
            width: parseInt(parsedData.data.dimensions.split("x")[0]),
            height: parseInt(parsedData.data.dimensions.split("x")[1]),
            thumbnail: parsedData.data.thumbnail,
            mapElements: {
                create: parsedData.data.defaultElements.map(e => ({
                    elementId: e.elementId,
                    x: e.x,
                    y: e.y
                }))
            }
        }
    })

    res.json({
        id: map.id
    })
})

adminRouter.post("/season", async (req, res) => {
    const { name, startDate, endDate, theme, itemIds } = req.body;
    if (!name || !startDate || !endDate || !theme) {
        res.status(400).json({ message: "name, startDate, endDate, theme required" });
        return;
    }
    const season = await client.season.create({
        data: {
            name,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            theme,
            items: itemIds?.length ? {
                create: itemIds.map((itemId: string) => ({ itemId })),
            } : undefined,
        },
    });
    res.json({ id: season.id, name: season.name });
})