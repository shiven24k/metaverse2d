import { Router } from "express";
import client from "@repo/db/client";
import { userMiddleware } from "../../middleware/user";
import { AddElementSchema, CreateSpaceSchema, DeleteElementSchema, BatchAddElementSchema, BatchPlaceItemSchema, BatchDeleteElementSchema, BatchDeleteItemSchema } from "../../types";

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

    const element = await client.element.findUnique({
        where: { id: req.body.elementId },
        select: { width: true, height: true },
    });
    if (!element) {
        res.status(400).json({ message: "Element not found" });
        return;
    }

    const ew = element.width;
    const eh = element.height;

    if (req.body.x < 0 || req.body.y < 0 || req.body.x + ew > space.width || req.body.y + eh > space.height) {
        res.status(400).json({ message: "Element footprint is outside of the boundary" });
        return;
    }

    const allExistingElements = await client.spaceElements.findMany({
        where: { spaceId: req.body.spaceId },
        select: { x: true, y: true, element: { select: { width: true, height: true } } },
    });
    const allExistingItems = await client.placedItem.findMany({
        where: { spaceId: req.body.spaceId },
        select: { x: true, y: true, item: { select: { width: true, height: true } } },
    });
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

// ── Default NPC templates seeded into every new space ─────────────────────────
function makeDefaultNpcs(spaceId: string, w: number, h: number) {
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    return [
        {
            spaceId,
            name: "Manager Mike",
            sprite: "avatar-default",
            dialogues: [
                "Good morning! The Q3 report is due by EOD.",
                "Have you checked your emails today? We have a 10am standup.",
                "Great work on that last sprint. Keep it up, team!",
            ],
            x: Math.max(1, cx - 3),
            y: Math.max(1, cy - 3),
            patrolPath: [
                { x: Math.max(1, cx - 3), y: Math.max(1, cy - 3) },
                { x: Math.min(w - 2, cx),  y: Math.max(1, cy - 3) },
                { x: Math.min(w - 2, cx),  y: Math.min(h - 2, cy) },
                { x: Math.max(1, cx - 3), y: Math.min(h - 2, cy) },
            ],
        },
        {
            spaceId,
            name: "Dev Dana",
            sprite: "avatar-ninja",
            dialogues: [
                "I'm in the zone — just pushed a fix for the auth bug!",
                "Has anyone reviewed my PR? It's been sitting for two days...",
                "Pro tip: press F near an Office Chair to sit and work!",
            ],
            x: Math.min(w - 2, cx + 3),
            y: Math.max(1, cy - 2),
            patrolPath: [
                { x: Math.min(w - 2, cx + 3), y: Math.max(1, cy - 2) },
                { x: Math.min(w - 2, cx + 5), y: Math.max(1, cy - 2) },
                { x: Math.min(w - 2, cx + 5), y: Math.min(h - 2, cy + 2) },
                { x: Math.min(w - 2, cx + 3), y: Math.min(h - 2, cy + 2) },
            ],
        },
        {
            spaceId,
            name: "HR Helen",
            sprite: "avatar-wizard",
            dialogues: [
                "Don't forget to log your hours in the time tracker!",
                "PTO requests must be submitted two weeks in advance.",
                "We're hosting a team lunch on Friday — RSVP in Slack!",
            ],
            x: Math.max(1, cx - 1),
            y: Math.min(h - 2, cy + 4),
            patrolPath: [
                { x: Math.max(1, cx - 1),    y: Math.min(h - 2, cy + 4) },
                { x: Math.min(w - 2, cx + 2), y: Math.min(h - 2, cy + 4) },
                { x: Math.min(w - 2, cx + 2), y: Math.min(h - 2, cy + 6) },
                { x: Math.max(1, cx - 1),    y: Math.min(h - 2, cy + 6) },
            ],
        },
    ];
}

// POST /space — create a new space, auth required
spaceRouter.post("/", userMiddleware, async (req, res) => {
    const parsedData = CreateSpaceSchema.safeParse(req.body);
    if (!parsedData.success) {
        res.status(400).json({ message: "Validation failed" });
        return;
    }

    if (!parsedData.data.mapId) {
        const w = parseInt(parsedData.data.dimensions.split("x")[0]);
        const h = parseInt(parsedData.data.dimensions.split("x")[1]);
        const space = await client.space.create({
            data: { name: parsedData.data.name, width: w, height: h, creatorId: req.userId! },
        });
        await client.nPC.createMany({ data: makeDefaultNpcs(space.id, w, h) });
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

    const space = await client.$transaction(async (tx) => {
        const space = await tx.space.create({
            data: {
                name: parsedData.data.name,
                width: map.width,
                height: map.height,
                creatorId: req.userId!,
            },
        });
        await tx.spaceElements.createMany({
            data: map.mapElements.map((e) => ({
                spaceId: space.id,
                elementId: e.elementId,
                x: e.x!,
                y: e.y!,
            })),
        });
        await tx.nPC.createMany({ data: makeDefaultNpcs(space.id, map.width, map.height) });
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
        const elType = typeMap.get(el.elementId);
        if (!elType) continue;
        const ew = elType.width;
        const eh = elType.height;
        if (el.x < 0 || el.y < 0 || el.x + ew > space.width || el.y + eh > space.height) continue;
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
        existingElements.push({ x: el.x, y: el.y, element: elType });
    }

    if (toCreate.length === 0) {
        res.json({ message: "No elements placed", count: 0 });
        return;
    }

    const created = await client.spaceElements.createManyAndReturn({
        data: toCreate,
        select: { id: true, elementId: true, x: true, y: true },
    });
    res.json({ message: `Placed ${created.length} elements`, count: created.length, elements: created });
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

    const toPlace: { spaceId: string; itemId: string; x: number; y: number; layer: "FLOOR" | "WALL" }[] = [];
    const toDeduct = new Map<string, number>();

    for (const it of items) {
        const type = typeMap.get(it.itemId);
        if (!type) continue;
        if (it.x < 0 || it.y < 0 || it.x + type.width > space.width || it.y + type.height > space.height) continue;
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

    const created = await client.$transaction(async (tx) => {
        for (const [itemId, qty] of toDeduct) {
            await tx.inventoryItem.updateMany({
                where: { userId: req.userId!, itemId },
                data: { quantity: { decrement: qty } },
            });
        }
        return tx.placedItem.createManyAndReturn({
            data: toPlace,
            select: { id: true, itemId: true, x: true, y: true, layer: true },
        });
    });

    res.json({ message: `Placed ${created.length} items`, count: created.length, items: created });
});

// ─── Batch delete routes ───────────────────────────────────────────────────────

spaceRouter.post("/element/batch-delete", userMiddleware, async (req, res) => {
    const parsed = BatchDeleteElementSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Validation failed", errors: parsed.error.issues });
        return;
    }
    const { spaceId, ids } = parsed.data;
    const space = await client.space.findUnique({ where: { id: spaceId, creatorId: req.userId! } });
    if (!space) { res.status(403).json({ message: "Space not found or not yours" }); return; }

    const { count } = await client.spaceElements.deleteMany({ where: { id: { in: ids }, spaceId } });
    res.json({ message: `Deleted ${count} elements`, count });
});

spaceRouter.post("/placed/batch-delete", userMiddleware, async (req, res) => {
    const parsed = BatchDeleteItemSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Validation failed", errors: parsed.error.issues });
        return;
    }
    const { spaceId, ids } = parsed.data;
    const space = await client.space.findUnique({ where: { id: spaceId, creatorId: req.userId! } });
    if (!space) { res.status(403).json({ message: "Space not found or not yours" }); return; }

    const toDelete = await client.placedItem.findMany({
        where: { id: { in: ids }, spaceId },
        select: { itemId: true },
    });
    await client.$transaction(async (tx) => {
        await tx.placedItem.deleteMany({ where: { id: { in: ids }, spaceId } });
        const itemCounts = new Map<string, number>();
        for (const p of toDelete) itemCounts.set(p.itemId, (itemCounts.get(p.itemId) || 0) + 1);
        for (const [itemId, qty] of itemCounts) {
            await tx.inventoryItem.updateMany({
                where: { userId: req.userId!, itemId },
                data: { quantity: { increment: qty } },
            });
        }
    });
    res.json({ message: `Deleted ${toDelete.length} items`, count: toDelete.length });
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

    const itemType = await client.item.findUnique({
        where: { id: itemId },
        select: { width: true, height: true },
    });
    if (!itemType) {
        res.status(400).json({ message: "Item not found" });
        return;
    }

    if (x < 0 || y < 0 || x + itemType.width > space.width || y + itemType.height > space.height) {
        res.status(400).json({ message: "Item footprint is outside of the boundary" });
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

// PUT /space/placed/:id/metadata — update sign/item metadata (owner only)
spaceRouter.put("/placed/:id/metadata", userMiddleware, async (req, res) => {
    const { metadata } = req.body;
    if (!metadata || typeof metadata !== "object") {
        res.status(400).json({ message: "metadata object required" });
        return;
    }

    const placed = await client.placedItem.findUnique({
        where: { id: req.params.id },
        include: { space: { select: { creatorId: true } } },
    });

    if (!placed || placed.space.creatorId !== req.userId) {
        res.status(403).json({ message: "Unauthorized" });
        return;
    }

    await client.placedItem.update({
        where: { id: req.params.id },
        data: { metadata },
    });

    res.json({ message: "Metadata updated" });
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

    const ew = spaceElement.element.width;
    const eh = spaceElement.element.height;

    if (x < 0 || y < 0 || x + ew > spaceElement.space.width || y + eh > spaceElement.space.height) {
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

    const iw = placed.item.width;
    const ih = placed.item.height;

    if (x < 0 || y < 0 || x + iw > placed.space.width || y + ih > placed.space.height) {
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

// ─── NPC routes ────────────────────────────────────────────────────────────────

spaceRouter.get("/:spaceId/npcs", async (req, res) => {
    const npcs = await client.nPC.findMany({ where: { spaceId: req.params.spaceId } });
    res.json({ npcs });
});

const VALID_MOTION_TYPES = new Set(['STATIC', 'PATROL', 'WANDER']);

// POST /space/:spaceId/npc — create NPC (owner only)
spaceRouter.post("/:spaceId/npc", userMiddleware, async (req, res) => {
    const { name, sprite, dialogues, x, y, patrolPath, motionType, wanderRadius } = req.body;
    const space = await client.space.findUnique({
        where: { id: req.params.spaceId, creatorId: req.userId! },
    });
    if (!space) { res.status(403).json({ message: "Unauthorized" }); return; }
    const npc = await client.nPC.create({
        data: {
            spaceId:      req.params.spaceId,
            name:         name        || "New NPC",
            sprite:       sprite      || "avatar-default",
            dialogues:    Array.isArray(dialogues) ? dialogues.filter(Boolean) : [],
            x:            typeof x === "number" ? x : Math.floor(space.width  / 2),
            y:            typeof y === "number" ? y : Math.floor(space.height / 2),
            patrolPath:   Array.isArray(patrolPath) ? patrolPath : [],
            motionType:   VALID_MOTION_TYPES.has(motionType) ? motionType : "PATROL",
            wanderRadius: typeof wanderRadius === "number" ? Math.max(1, Math.min(10, wanderRadius)) : 3,
        },
    });
    res.status(201).json({ npc });
});

// PUT /space/npc/:id — update NPC (owner only) — must be before /:spaceId dynamic routes
spaceRouter.put("/npc/:id", userMiddleware, async (req, res) => {
    const npc = await client.nPC.findUnique({
        where: { id: req.params.id },
        include: { space: { select: { creatorId: true } } },
    });
    if (!npc || npc.space.creatorId !== req.userId) {
        res.status(403).json({ message: "Unauthorized" }); return;
    }
    const { name, sprite, dialogues, x, y, patrolPath, motionType, wanderRadius } = req.body;
    const updated = await client.nPC.update({
        where: { id: req.params.id },
        data: {
            ...(name         !== undefined && { name }),
            ...(sprite       !== undefined && { sprite }),
            ...(dialogues    !== undefined && { dialogues: Array.isArray(dialogues) ? dialogues.filter(Boolean) : [] }),
            ...(x            !== undefined && { x }),
            ...(y            !== undefined && { y }),
            ...(patrolPath   !== undefined && { patrolPath }),
            ...(motionType   !== undefined && VALID_MOTION_TYPES.has(motionType) && { motionType }),
            ...(wanderRadius !== undefined && { wanderRadius: Math.max(1, Math.min(10, Number(wanderRadius))) }),
        },
    });
    res.json({ npc: updated });
});

// DELETE /space/npc/:id — delete NPC (owner only) — must be before /:spaceId dynamic routes
spaceRouter.delete("/npc/:id", userMiddleware, async (req, res) => {
    const npc = await client.nPC.findUnique({
        where: { id: req.params.id },
        include: { space: { select: { creatorId: true } } },
    });
    if (!npc || npc.space.creatorId !== req.userId) {
        res.status(403).json({ message: "Unauthorized" }); return;
    }
    await client.nPC.delete({ where: { id: req.params.id } });
    res.json({ message: "NPC deleted" });
});

// ─── Portal routes ─────────────────────────────────────────────────────────────

spaceRouter.delete("/portal/:id", userMiddleware, async (req, res) => {
    const portal = await client.spacePortal.findUnique({
        where: { id: req.params.id },
        include: { fromSpace: { select: { creatorId: true } } },
    });
    if (!portal || portal.fromSpace.creatorId !== req.userId) {
        res.status(403).json({ message: "Unauthorized" });
        return;
    }
    await client.spacePortal.delete({ where: { id: req.params.id } });
    res.json({ message: "Portal deleted" });
});

const VALID_EDGES = new Set(["NORTH", "SOUTH", "EAST", "WEST"]);

spaceRouter.post("/:spaceId/portal", userMiddleware, async (req, res) => {
    const { toSpaceId, fromEdge, toEdge, label } = req.body;
    if (!toSpaceId || !fromEdge || !toEdge) {
        res.status(400).json({ message: "toSpaceId, fromEdge, toEdge required" });
        return;
    }
    if (!VALID_EDGES.has(fromEdge) || !VALID_EDGES.has(toEdge)) {
        res.status(400).json({ message: "fromEdge and toEdge must be NORTH, SOUTH, EAST, or WEST" });
        return;
    }
    const space = await client.space.findUnique({
        where: { id: req.params.spaceId, creatorId: req.userId! },
    });
    if (!space) {
        res.status(403).json({ message: "Space not found or not yours" });
        return;
    }
    const toSpace = await client.space.findUnique({ where: { id: toSpaceId } });
    if (!toSpace) {
        res.status(400).json({ message: "Destination space not found" });
        return;
    }
    const portal = await client.spacePortal.create({
        data: { fromSpaceId: req.params.spaceId, toSpaceId, fromEdge, toEdge, label: label || "Portal" },
    });
    res.json({ portal });
});

// ─── Resize route ──────────────────────────────────────────────────────────────

spaceRouter.put("/:spaceId/resize", userMiddleware, async (req, res) => {
    const { width, height, offsetX, offsetY } = req.body;
    if (!width || !height || width < 5 || height < 5 || width > 200 || height > 200) {
        res.status(400).json({ message: "width and height required (5–200)" });
        return;
    }
    const space = await client.space.findUnique({
        where: { id: req.params.spaceId, creatorId: req.userId! },
    });
    if (!space) {
        res.status(403).json({ message: "Space not found or not yours" });
        return;
    }

    const dX = typeof offsetX === "number" ? offsetX : 0;
    const dY = typeof offsetY === "number" ? offsetY : 0;

    await client.$transaction(async (tx) => {
        await tx.space.update({ where: { id: req.params.spaceId }, data: { width, height } });
        if (dX !== 0) {
            await tx.spaceElements.updateMany({
                where: { spaceId: req.params.spaceId },
                data: { x: { increment: dX } },
            });
            await tx.placedItem.updateMany({
                where: { spaceId: req.params.spaceId },
                data: { x: { increment: dX } },
            });
        }
        if (dY !== 0) {
            await tx.spaceElements.updateMany({
                where: { spaceId: req.params.spaceId },
                data: { y: { increment: dY } },
            });
            await tx.placedItem.updateMany({
                where: { spaceId: req.params.spaceId },
                data: { y: { increment: dY } },
            });
        }
    });

    res.json({ message: "Space resized", width, height });
});

// ─── Dynamic routes last ──────────────────────────────────────────────────────

// DELETE /space/:spaceId/clear — wipe all tiles/items but keep the space itself
spaceRouter.delete("/:spaceId/clear", userMiddleware, async (req, res) => {
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

    await client.$transaction(async (tx) => {
        const placed = await tx.placedItem.findMany({
            where: { spaceId: req.params.spaceId },
            select: { itemId: true },
        });
        await tx.spaceElements.deleteMany({ where: { spaceId: req.params.spaceId } });
        await tx.placedItem.deleteMany({ where: { spaceId: req.params.spaceId } });
        const itemCounts = new Map<string, number>();
        for (const p of placed) itemCounts.set(p.itemId, (itemCounts.get(p.itemId) || 0) + 1);
        for (const [itemId, qty] of itemCounts) {
            await tx.inventoryItem.upsert({
                where: { userId_itemId: { userId: req.userId!, itemId } },
                create: { userId: req.userId!, itemId, quantity: qty },
                update: { quantity: { increment: qty } },
            });
        }
    });

    res.json({ message: "Space cleared" });
});

// DELETE /space/:spaceId — owner only, cascades to all related records
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

    await client.$transaction(async (tx) => {
        await tx.spaceElements.deleteMany({ where: { spaceId: req.params.spaceId } });
        await tx.space.delete({ where: { id: req.params.spaceId } });
    });

    res.json({ message: "Space deleted" });
});

// GET /space/:spaceId — public, anyone can read space details (needed to join)
spaceRouter.get("/:spaceId", async (req, res) => {
    const space = await client.space.findUnique({
        where: { id: req.params.spaceId },
        include: {
            elements: { include: { element: true } },
            placedItems: { include: { item: true } },
            fromPortals: true,
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
                blocking: e.element.blocking,
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
                blocking: p.item.blocking,
            },
            x: p.x,
            y: p.y,
            layer: p.layer,
            metadata: p.metadata ?? null,
        })),
        portals: space.fromPortals.map((p) => ({
            id: p.id,
            toSpaceId: p.toSpaceId,
            fromEdge: p.fromEdge,
            toEdge: p.toEdge,
            label: p.label,
        })),
    });
});
