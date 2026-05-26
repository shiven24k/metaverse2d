import { Router } from "express";
import client from "@repo/db/client";
import { userMiddleware } from "../../middleware/user";
import { AddElementSchema, CreateSpaceSchema, DeleteElementSchema } from "../../types";

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

    if (req.body.x < 0 || req.body.y < 0 || req.body.x > space.width || req.body.y > space.height) {
        res.status(400).json({ message: "Point is outside of the boundary" });
        return;
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
