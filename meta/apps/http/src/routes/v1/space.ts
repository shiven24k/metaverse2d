import { Router } from "express";
import client from "@repo/db/client";
import { userMiddleware } from "../../middleware/user";
import { AddElementSchema, CreateSpaceSchema, DeleteElementSchema, BatchAddElementSchema, BatchPlaceItemSchema } from "../../types";

export const spaceRouter = Router();

// ─── Static routes first (must come before /:spaceId) ────────────────────────

// GET /space/public — all spaces, no auth required (anyone can browse & join)
spaceRouter.get("/public", async (req, res) => {
    const spaces = await client.space.findMany({
        include: {
            creator: {
                select: { username: true, name: true },
            },
        },
        orderBy: { name: "asc" },
    });

    res.json({
        spaces: spaces.map((s) => ({
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail,
            dimensions: `${s.width}x${s.height}`,
            createdBy: s.creator.username ?? s.creator.name,
        })),
    });
});

// GET /space/all — only spaces owned by the current user
spaceRouter.get("/all", userMiddleware, async (req, res) => {
    const spaces = await client.space.findMany({
        where: { creatorId: req.userId! },
    });

    res.json({
        spaces: spaces.map((s) => ({
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail,
            dimensions: `${s.width}x${s.height}`,
        })),
    });
});

// DELETE /space/element — owner only
spaceRouter.delete("/element", userMiddleware, async (req, res) => {
    const parsedData = DeleteElementSchema.safeParse(req.body);
    if (!parsedData.success) {
        res.status(400).json({ message: "Validation failed" });
        return;
    }

    const spaceElement = await client.spaceElements.findFirst({
        where: { id: parsedData.data.id },
        include: { space: true },
    });

    if (!spaceElement?.space.creatorId || spaceElement.space.creatorId !== req.userId) {
        res.status(403).json({ message: "Unauthorized" });
        return;
    }

    await client.spaceElements.delete({ where: { id: parsedData.data.id } });
    res.json({ message: "Element deleted" });
});

// POST /space/element — owner only
spaceRouter.post("/element", userMiddleware, async (req, res) => {
    const parsedData = AddElementSchema.safeParse(req.body);
    if (!parsedData.success) {
        res.status(400).json({ message: "Validation failed" });
        return;
    }

    const space = await client.space.findUnique({
        where: { id: req.body.spaceId, creatorId: req.userId! },
        select: { width: true, height: true },
    });

    if (!space) {
        res.status(400).json({ message: "Space not found" });
        return;
    }

    if (req.body.x < 0 || req.body.y < 0 || req.body.x >= space.width || req.body.y >= space.height) {
        res.status(400).json({ message: "Point is outside of the boundary" });
        return;
    }

    const element = await client.element.findUnique({
        where: { id: req.body.elementId },
        select: { width: true, height: true },
    });
    if (!element) {
        res.status(400).json({ message: "Element not found" });
        return;
    }

    const existing = await client.spaceElements.findFirst({
        where: { spaceId: req.body.spaceId },
        select: { x: true, y: true },
    });
    const allExistingElements = await client.spaceElements.findMany({
        where: { spaceId: req.body.spaceId },
        select: { x: true, y: true, element: { select: { width: true, height: true } } },
    });
    const allExistingItems = await client.placedItem.findMany({
        where: { spaceId: req.body.spaceId },
        select: { x: true, y: true, item: { select: { width: true, height: true } } },
    });
    const ew = element.width;
    const eh = element.height;
    for (const e of allExistingElements) {
        if (req.body.x < e.x + e.element.width && req.body.x + ew > e.x && req.body.y < e.y + e.element.height && req.body.y + eh > e.y) {
            res.status(409).json({ message: "Position overlaps with existing element" });
            return;
        }
    }
    for (const p of allExistingItems) {
        if (req.body.x < p.x + p.item.width && req.body.x + ew > p.x && req.body.y < p.y + p.item.height && req.body.y + eh > p.y) {
            res.status(409).json({ message: "Position overlaps with existing item" });
            return;
        }
    }

    await client.spaceElements.create({
        data: {
            spaceId: req.body.spaceId,
            elementId: req.body.elementId,
            x: req.body.x,
            y: req.body.y,
        },
    });

    res.json({ message: "Element added" });
});

// POST /space — create a new space, auth required
spaceRouter.post("/", userMiddleware, async (req, res) => {
    const parsedData = CreateSpaceSchema.safeParse(req.body);
    if (!parsedData.success) {
        res.status(400).json({ message: "Validation failed" });
        return;
    }

    if (!parsedData.data.mapId) {
        const space = await client.space.create({
            data: {
                name: parsedData.data.name,
                width: parseInt(parsedData.data.dimensions.split("x")[0]),
                height: parseInt(parsedData.data.dimensions.split("x")[1]),
                creatorId: req.userId!,
            },
        });
        res.json({ spaceId: space.id });
        return;
    }

    const map = await client.map.findFirst({
        where: { id: parsedData.data.mapId },
        select: { mapElements: true, width: true, height: true },
    });

    if (!map) {
        res.status(400).json({ message: "Map not found" });
        return;
    }

    const space = await client.$transaction(async () => {
        const space = await client.space.create({
            data: {
                name: parsedData.data.name,
                width: map.width,
                height: map.height,
                creatorId: req.userId!,
            },
        });
        await client.spaceElements.createMany({
            data: map.mapElements.map((e) => ({
                spaceId: space.id,
                elementId: e.elementId,
                x: e.x!,
                y: e.y!,
            })),
        });
        return space;
    });

    res.json({ spaceId: space.id });
});

// ─── Batch placement routes ─────────────────────────────────────────────────────

spaceRouter.post("/element/batch", userMiddleware, async (req, res) => {
    const parsed = BatchAddElementSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Validation failed", errors: parsed.error.issues });
        return;
    }
    const { spaceId, elements } = parsed.data;

    const space = await client.space.findUnique({
        where: { id: spaceId, creatorId: req.userId! },
        select: { width: true, height: true },
    });
    if (!space) {
        res.status(403).json({ message: "Space not found or not yours" });
        return;
    }

    const elementTypes = await client.element.findMany({
        where: { id: { in: [...new Set(elements.map(e => e.elementId))] } },
        select: { id: true, width: true, height: true },
    });
    const typeMap = new Map(elementTypes.map(e => [e.id, e]));

    const existingElements = await client.spaceElements.findMany({
        where: { spaceId },
        select: { x: true, y: true, element: { select: { width: true, height: true } } },
    });
    const existingItems = await client.placedItem.findMany({
        where: { spaceId },
        select: { x: true, y: true, item: { select: { width: true, height: true } } },
    });

    const toCreate: { spaceId: string; elementId: string; x: number; y: number }[] = [];
    for (const el of elements) {
        if (el.x < 0 || el.y < 0 || el.x >= space.width || el.y >= space.height) continue;
        const type = typeMap.get(el.elementId);
        if (!type) continue;
        const ew = type.width;
        const eh = type.height;
        let collides = false;
        for (const e of existingElements) {
            if (el.x < e.x + e.element.width && el.x + ew > e.x && el.y < e.y + e.element.height && el.y + eh > e.y) { collides = true; break; }
        }
        if (collides) continue;
        for (const p of existingItems) {
            if (el.x < p.x + p.item.width && el.x + ew > p.x && el.y < p.y + p.item.height && el.y + eh > p.y) { collides = true; break; }
        }
        if (collides) continue;
        toCreate.push({ spaceId, elementId: el.elementId, x: el.x, y: el.y });
        existingElements.push({ x: el.x, y: el.y, element: type });
    }

    if (toCreate.length === 0) {
        res.json({ message: "No elements placed", count: 0 });
        return;
    }

    await client.spaceElements.createMany({ data: toCreate });
    res.json({ message: `Placed ${toCreate.length} elements`, count: toCreate.length });
});

spaceRouter.post("/place/batch", userMiddleware, async (req, res) => {
    const parsed = BatchPlaceItemSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Validation failed", errors: parsed.error.issues });
        return;
    }
    const { spaceId, items } = parsed.data;

    const space = await client.space.findUnique({
        where: { id: spaceId, creatorId: req.userId! },
        select: { width: true, height: true },
    });
    if (!space) {
        res.status(403).json({ message: "Space not found or not yours" });
        return;
    }

    const itemTypes = await client.item.findMany({
        where: { id: { in: [...new Set(items.map(i => i.itemId))] } },
        select: { id: true, width: true, height: true },
    });
    const typeMap = new Map(itemTypes.map(i => [i.id, i]));

    const existingElements = await client.spaceElements.findMany({
        where: { spaceId },
        select: { x: true, y: true, element: { select: { width: true, height: true } } },
    });
    const existingItems = await client.placedItem.findMany({
        where: { spaceId },
        select: { x: true, y: true, item: { select: { width: true, height: true } } },
    });

    const itemCounts = new Map<string, number>();
    for (const i of items) {
        itemCounts.set(i.itemId, (itemCounts.get(i.itemId) || 0) + 1);
    }

    const inventory = await client.inventoryItem.findMany({
        where: { userId: req.userId!, itemId: { in: [...itemCounts.keys()] } },
    });
    const invMap = new Map(inventory.map(i => [i.itemId, i.quantity]));

    const toPlace: { spaceId: string; itemId: string; x: number; y: number; layer: string }[] = [];
    const toDeduct = new Map<string, number>();

    for (const it of items) {
        if (it.x < 0 || it.y < 0 || it.x >= space.width || it.y >= space.height) continue;
        const type = typeMap.get(it.itemId);
        if (!type) continue;
        const needed = (toDeduct.get(it.itemId) || 0) + 1;
        if ((invMap.get(it.itemId) || 0) < needed) continue;
        const iw = type.width;
        const ih = type.height;
        let collides = false;
        for (const e of existingElements) {
            if (it.x < e.x + e.element.width && it.x + iw > e.x && it.y < e.y + e.element.height && it.y + ih > e.y) { collides = true; break; }
        }
        if (collides) continue;
        for (const p of existingItems) {
            if (it.x < p.x + p.item.width && it.x + iw > p.x && it.y < p.y + p.item.height && it.y + ih > p.y) { collides = true; break; }
        }
        if (collides) continue;
        toDeduct.set(it.itemId, needed);
        toPlace.push({ spaceId, itemId: it.itemId, x: it.x, y: it.y, layer: it.layer ?? "FLOOR" });
        existingItems.push({ x: it.x, y: it.y, item: type });
    }

    if (toPlace.length === 0) {
        res.json({ message: "No items placed", count: 0 });
        return;
    }

    await client.$transaction(async (tx) => {
        for (const [itemId, qty] of toDeduct) {
            await tx.inventoryItem.updateMany({
                where: { userId: req.userId!, itemId },
                data: { quantity: { decrement: qty } },
            });
        }
        await tx.placedItem.createMany({ data: toPlace });
    });

    res.json({ message: `Placed ${toPlace.length} items`, count: toPlace.length });
});

// ─── Placement routes ──────────────────────────────────────────────────────────

spaceRouter.post("/place", userMiddleware, async (req, res) => {
    const { spaceId, itemId, x, y, layer } = req.body;
    if (!spaceId || !itemId || x == null || y == null) {
        res.status(400).json({ message: "spaceId, itemId, x, y required" });
        return;
    }

    const space = await client.space.findUnique({
        where: { id: spaceId, creatorId: req.userId! },
    });
    if (!space) {
        res.status(403).json({ message: "Space not found or not yours" });
        return;
    }

    if (x < 0 || y < 0 || x >= space.width || y >= space.height) {
        res.status(400).json({ message: "Position out of bounds" });
        return;
    }

    const itemType = await client.item.findUnique({
        where: { id: itemId },
        select: { width: true, height: true },
    });
    if (!itemType) {
        res.status(400).json({ message: "Item not found" });
        return;
    }

    const existingElements = await client.spaceElements.findMany({
        where: { spaceId },
        select: { x: true, y: true, element: { select: { width: true, height: true } } },
    });
    const existingItems = await client.placedItem.findMany({
        where: { spaceId },
        select: { x: true, y: true, item: { select: { width: true, height: true } } },
    });
    const iw = itemType.width;
    const ih = itemType.height;
    for (const e of existingElements) {
        if (x < e.x + e.element.width && x + iw > e.x && y < e.y + e.element.height && y + ih > e.y) {
            res.status(409).json({ message: "Position overlaps with existing element" });
            return;
        }
    }
    for (const p of existingItems) {
        if (x < p.x + p.item.width && x + iw > p.x && y < p.y + p.item.height && y + ih > p.y) {
            res.status(409).json({ message: "Position overlaps with existing item" });
            return;
        }
    }

    const inv = await client.inventoryItem.findUnique({
        where: { userId_itemId: { userId: req.userId!, itemId } },
    });
    if (!inv || inv.quantity < 1) {
        res.status(400).json({ message: "Item not in inventory" });
        return;
    }

    const placed = await client.$transaction(async (tx) => {
        await tx.inventoryItem.update({
            where: { userId_itemId: { userId: req.userId!, itemId } },
            data: { quantity: { decrement: 1 } },
        });
        return tx.placedItem.create({
            data: { spaceId, itemId, x, y, layer: layer ?? "FLOOR" },
        });
    });

    res.json({ id: placed.id, itemId, x, y, layer: placed.layer });
});

spaceRouter.delete("/placed/:id", userMiddleware, async (req, res) => {
    const placed = await client.placedItem.findUnique({
        where: { id: req.params.id },
        include: { space: { select: { creatorId: true } } },
    });

    if (!placed || placed.space.creatorId !== req.userId) {
        res.status(403).json({ message: "Unauthorized" });
        return;
    }

    await client.$transaction(async (tx) => {
        await tx.placedItem.delete({ where: { id: req.params.id } });
        await tx.inventoryItem.upsert({
            where: { userId_itemId: { userId: req.userId!, itemId: placed.itemId } },
            create: { userId: req.userId!, itemId: placed.itemId, quantity: 1 },
            update: { quantity: { increment: 1 } },
        });
    });

    res.json({ message: "Item returned to inventory" });
});

// ─── Move routes ────────────────────────────────────────────────────────────────

spaceRouter.put("/element/:id/move", userMiddleware, async (req, res) => {
    const { x, y } = req.body;
    if (x == null || y == null) {
        res.status(400).json({ message: "x, y required" });
        return;
    }

    const spaceElement = await client.spaceElements.findFirst({
        where: { id: req.params.id },
        include: { space: true, element: { select: { width: true, height: true } } },
    });
    if (!spaceElement || spaceElement.space.creatorId !== req.userId) {
        res.status(403).json({ message: "Unauthorized" });
        return;
    }

    if (x < 0 || y < 0 || x >= spaceElement.space.width || y >= spaceElement.space.height) {
        res.status(400).json({ message: "Position out of bounds" });
        return;
    }

    const existingElements = await client.spaceElements.findMany({
        where: { spaceId: spaceElement.spaceId, id: { not: req.params.id } },
        select: { x: true, y: true, element: { select: { width: true, height: true } } },
    });
    const existingItems = await client.placedItem.findMany({
        where: { spaceId: spaceElement.spaceId },
        select: { x: true, y: true, item: { select: { width: true, height: true } } },
    });

    const ew = spaceElement.element.width;
    const eh = spaceElement.element.height;
    for (const e of existingElements) {
        if (x < e.x + e.element.width && x + ew > e.x && y < e.y + e.element.height && y + eh > e.y) {
            res.status(409).json({ message: "Position overlaps with existing element" });
            return;
        }
    }
    for (const p of existingItems) {
        if (x < p.x + p.item.width && x + ew > p.x && y < p.y + p.item.height && y + eh > p.y) {
            res.status(409).json({ message: "Position overlaps with existing item" });
            return;
        }
    }

    await client.spaceElements.update({ where: { id: req.params.id }, data: { x, y } });
    res.json({ message: "Element moved" });
});

spaceRouter.put("/placed/:id/move", userMiddleware, async (req, res) => {
    const { x, y } = req.body;
    if (x == null || y == null) {
        res.status(400).json({ message: "x, y required" });
        return;
    }

    const placed = await client.placedItem.findFirst({
        where: { id: req.params.id },
        include: { space: { select: { width: true, height: true, creatorId: true } }, item: { select: { width: true, height: true } } },
    });
    if (!placed || placed.space.creatorId !== req.userId) {
        res.status(403).json({ message: "Unauthorized" });
        return;
    }

    if (x < 0 || y < 0 || x >= placed.space.width || y >= placed.space.height) {
        res.status(400).json({ message: "Position out of bounds" });
        return;
    }

    const existingElements = await client.spaceElements.findMany({
        where: { spaceId: placed.spaceId },
        select: { x: true, y: true, element: { select: { width: true, height: true } } },
    });
    const existingItems = await client.placedItem.findMany({
        where: { spaceId: placed.spaceId, id: { not: req.params.id } },
        select: { x: true, y: true, item: { select: { width: true, height: true } } },
    });

    const iw = placed.item.width;
    const ih = placed.item.height;
    for (const e of existingElements) {
        if (x < e.x + e.element.width && x + iw > e.x && y < e.y + e.element.height && y + ih > e.y) {
            res.status(409).json({ message: "Position overlaps with existing element" });
            return;
        }
    }
    for (const p of existingItems) {
        if (x < p.x + p.item.width && x + iw > p.x && y < p.y + p.item.height && y + ih > p.y) {
            res.status(409).json({ message: "Position overlaps with existing item" });
            return;
        }
    }

    await client.placedItem.update({ where: { id: req.params.id }, data: { x, y } });
    res.json({ message: "Item moved" });
});

// ─── Dynamic routes last ──────────────────────────────────────────────────────

// DELETE /space/:spaceId — owner only
spaceRouter.delete("/:spaceId", userMiddleware, async (req, res) => {
    const space = await client.space.findUnique({
        where: { id: req.params.spaceId },
        select: { creatorId: true },
    });

    if (!space) {
        res.status(400).json({ message: "Space not found" });
        return;
    }

    if (space.creatorId !== req.userId) {
        res.status(403).json({ message: "Unauthorized" });
        return;
    }

    await client.space.delete({ where: { id: req.params.spaceId } });
    res.json({ message: "Space deleted" });
});

// GET /space/:spaceId — public, anyone can read space details (needed to join)
spaceRouter.get("/:spaceId", async (req, res) => {
    const space = await client.space.findUnique({
        where: { id: req.params.spaceId },
        include: {
            elements: { include: { element: true } },
            placedItems: { include: { item: true } },
        },
    });

    if (!space) {
        res.status(400).json({ message: "Space not found" });
        return;
    }

    res.json({
        name: space.name,
        dimensions: `${space.width}x${space.height}`,
        elements: space.elements.map((e) => ({
            id: e.id,
            element: {
                id: e.element.id,
                imageUrl: e.element.imageUrl,
                width: e.element.width,
                height: e.element.height,
                static: e.element.static,
            },
            x: e.x,
            y: e.y,
        })),
        placedItems: space.placedItems.map((p) => ({
            id: p.id,
            item: {
                id: p.item.id,
                name: p.item.name,
                imageUrl: p.item.imageUrl,
                width: p.item.width,
                height: p.item.height,
            },
            x: p.x,
            y: p.y,
            layer: p.layer,
        })),
    });
});
