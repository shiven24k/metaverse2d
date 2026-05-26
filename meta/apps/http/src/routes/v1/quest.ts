import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import client from "@repo/db/client";

export const questRouter = Router();

questRouter.get("/active", userMiddleware, async (req, res) => {
    const quests = await client.quest.findMany({
        where: { week: 1 },
        orderBy: { createdAt: "asc" },
    });

    const progress = await client.questProgress.findMany({
        where: {
            userId: req.userId,
            questId: { in: quests.map(q => q.id) },
        },
    });

    const progressMap = new Map(progress.map(p => [p.questId, p]));

    res.json({
        quests: quests.map(q => {
            const p = progressMap.get(q.id);
            return {
                id: q.id,
                title: q.title,
                description: q.description,
                goalCount: q.goalCount,
                rewardType: q.rewardType,
                rewardValue: q.rewardValue,
                progress: p?.progress ?? 0,
                completed: p?.completedAt != null,
            };
        }),
    });
});

questRouter.post("/progress", userMiddleware, async (req, res) => {
    const { questId } = req.body;
    if (!questId) {
        res.status(400).json({ message: "questId required" });
        return;
    }

    const quest = await client.quest.findUnique({
        where: { id: questId },
    });
    if (!quest) {
        res.status(404).json({ message: "Quest not found" });
        return;
    }

    const prog = await client.questProgress.upsert({
        where: {
            userId_questId: { userId: req.userId!, questId },
        },
        create: {
            userId: req.userId!,
            questId,
            progress: 1,
        },
        update: {
            progress: { increment: 1 },
        },
    });

    const completed = prog.progress >= quest.goalCount;

    if (completed && !prog.completedAt) {
        await client.questProgress.update({
            where: { id: prog.id },
            data: { completedAt: new Date() },
        });

        if (quest.rewardType === "coins") {
            let wallet = await client.wallet.findUnique({
                where: { userId: req.userId },
            });
            if (!wallet) {
                wallet = await client.wallet.create({
                    data: { userId: req.userId! },
                });
            }
            await client.wallet.update({
                where: { userId: req.userId },
                data: { coins: { increment: parseInt(quest.rewardValue) } },
            });
        } else if (quest.rewardType === "item") {
            await client.inventoryItem.upsert({
                where: {
                    userId_itemId: { userId: req.userId!, itemId: quest.rewardValue },
                },
                create: { userId: req.userId!, itemId: quest.rewardValue, quantity: 1 },
                update: { quantity: { increment: 1 } },
            });
        }
    }

    res.json({
        progress: prog.progress,
        goalCount: quest.goalCount,
        completed,
    });
});
