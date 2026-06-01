import { Router } from "express";
import { userRouter } from "./user";
import { spaceRouter } from "./space";
import { adminRouter } from "./admin";
import { itemRouter, inventoryRouter } from "./item";
import { walletRouter } from "./wallet";
import { giftRouter } from "./gift";
import { shopRouter } from "./shop";
import { playerRouter } from "./player";
import { guestbookRouter } from "./guestbook";
import { questRouter } from "./quest";
import { reportRouter } from "./report";
import { adminBanRouter } from "./adminBan";
import { seasonRouter } from "./season";
import { collectionRouter } from "./collection";
import { neighbourhoodRouter } from "./neighbourhood";
import { billingRouter } from "./billing";
import { mapsRouter } from "./maps";
import { uploadRouter } from "./upload";
import { economyRouter } from "./economy";
import client from "@repo/db/client";

export const router = Router();

router.get("/elements", async (req, res) => {
    const elements = await client.element.findMany();
    res.json({
        elements: elements.map(e => ({
            id: e.id,
            imageUrl: e.imageUrl,
            width: e.width,
            height: e.height,
            static: e.static,
            blocking: e.blocking,
        })),
    });
});

router.get("/avatars", async (req, res) => {
    const avatars = await client.avatar.findMany();
    res.json({
        avatars: avatars.map(x => ({
            id: x.id,
            imageUrl: x.imageUrl,
            name: x.name,
        })),
    });
});

router.use("/items", itemRouter);
router.use("/inventory", inventoryRouter);
router.use("/wallet", walletRouter);
router.use("/gift", giftRouter);
router.use("/shop", shopRouter);
router.use("/user", userRouter);
router.use("/player", playerRouter);
router.use("/guestbook", guestbookRouter);
router.use("/quests", questRouter);
router.use("/report", reportRouter);
router.use("/space", spaceRouter);
router.use("/admin", adminRouter);
router.use("/season", seasonRouter);
router.use("/collection", collectionRouter);
router.use("/neighbourhood", neighbourhoodRouter);
router.use("/billing", billingRouter);
router.use("/maps", mapsRouter);
router.use("/upload", uploadRouter);
router.use("/admin", adminBanRouter);
router.use("/economy", economyRouter);
