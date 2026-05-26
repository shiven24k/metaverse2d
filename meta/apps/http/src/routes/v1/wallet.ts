import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import client from "@repo/db/client";

export const walletRouter = Router();

walletRouter.get("/", userMiddleware, async (req, res) => {
    let wallet = await client.wallet.findUnique({
        where: { userId: req.userId },
    });
    if (!wallet) {
        wallet = await client.wallet.create({
            data: { userId: req.userId! },
        });
    }
    res.json({
        coins: wallet.coins,
        tokens: wallet.tokens,
        stars: wallet.stars,
    });
});
