import { Router } from "express";
import client from "@repo/db/client";

export const mapsRouter = Router();

mapsRouter.get("/", async (req, res) => {
    const maps = await client.map.findMany({
        orderBy: { name: "asc" },
    });

    res.json({
        maps: maps.map((m) => ({
            id: m.id,
            name: m.name,
            thumbnail: m.thumbnail,
            dimensions: `${m.width}x${m.height}`,
        })),
    });
});
