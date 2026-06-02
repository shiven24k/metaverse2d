import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import client from "@repo/db/client";

export const economyRouter = Router();

// POST /economy/interact — chest interaction with 1-hour cooldown
economyRouter.post("/interact", userMiddleware, async (req, res) => {
    const { placedItemId } = req.body;
    if (!placedItemId) {
        res.status(400).json({ message: "placedItemId required" });
        return;
    }

    const placed = await client.placedItem.findUnique({
        where: { id: placedItemId },
        include: { item: { select: { name: true } } },
    });

    if (!placed) {
        res.status(404).json({ message: "Item not found" });
        return;
    }

    if (!placed.item.name.toLowerCase().includes("chest")) {
        res.status(400).json({ message: "Not a chest" });
        return;
    }

    const coins = Math.floor(Math.random() * 16) + 10; // 10–25

    // Cooldown check inside the transaction to prevent TOCTOU double-claiming
    type CooldownError = Error & { isCooldown: true; minLeft: number };
    try {
        await client.$transaction(async (tx) => {
            const existing = await tx.chestInteraction.findUnique({
                where: { userId_placedItemId: { userId: req.userId!, placedItemId } },
            });
            if (existing) {
                const cooldownEnd = new Date(existing.lastAt.getTime() + 60 * 60 * 1000);
                if (new Date() < cooldownEnd) {
                    const minLeft = Math.ceil((cooldownEnd.getTime() - Date.now()) / 60000);
                    const err = Object.assign(new Error('COOLDOWN'), { isCooldown: true, minLeft }) as CooldownError;
                    throw err;
                }
            }
            await tx.chestInteraction.upsert({
                where: { userId_placedItemId: { userId: req.userId!, placedItemId } },
                create: { userId: req.userId!, placedItemId, lastAt: new Date() },
                update: { lastAt: new Date() },
            });
            await tx.wallet.upsert({
                where: { userId: req.userId! },
                create: { userId: req.userId!, coins },
                update: { coins: { increment: coins } },
            });
        });
    } catch (err: unknown) {
        if ((err as CooldownError).isCooldown) {
            const { minLeft } = err as CooldownError;
            res.status(429).json({ message: `Chest resets in ${minLeft} min`, cooldown: true });
            return;
        }
        throw err;
    }

    res.json({ coins, message: `You found ${coins} coins!` });
});
