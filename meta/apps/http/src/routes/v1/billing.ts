import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import client from "@repo/db/client";

export const billingRouter = Router();

billingRouter.post("/subscribe", userMiddleware, async (req, res) => {
    res.json({
        message: "Stripe integration not configured. Set STRIPE_SECRET_KEY to enable.",
        url: null,
    });
});

billingRouter.post("/webhook", async (req, res) => {
    res.status(501).json({ message: "Not implemented" });
});
