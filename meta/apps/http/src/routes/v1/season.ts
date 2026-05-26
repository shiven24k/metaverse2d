import { Router } from "express";
import client from "@repo/db/client";

export const seasonRouter = Router();

seasonRouter.get("/current", async (req, res) => {
    const now = new Date();
    const season = await client.season.findFirst({
        where: {
            startDate: { lte: now },
            endDate: { gte: now },
        },
        include: {
            items: {
                include: { item: { select: { id: true, name: true, imageUrl: true } } },
            },
        },
    });

    if (!season) {
        res.json({ season: null });
        return;
    }

    const daysRemaining = Math.ceil((season.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    res.json({
        season: {
            id: season.id,
            name: season.name,
            theme: season.theme,
            daysRemaining,
            startDate: season.startDate,
            endDate: season.endDate,
            items: season.items.map(si => si.item),
        },
    });
});
