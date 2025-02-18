import { Router } from "express";
import { UpdateMetadataSchema } from "../../types";
import client from "@repo/db/client";
import { userMiddleware } from "../../middleware/user";

export const userRouter = Router();

userRouter.post("/metadata", userMiddleware, async (req, res) => {
    const parsedData = UpdateMetadataSchema.safeParse(req.body)
    if (!parsedData.success) {
        res.status(400).json({message: "Validation failed"})
        return
    } 
    try {
        await client.user.update({
            where: {
                id: req.userId
            },
            data: {
                avatarId: parsedData.data.avatarId
            }
        })
        res.json({message: "Metadata updated successfully"})
    } catch (e) {
        res.status(500).json({message: "Internal server error"})
    }
})

userRouter.get("/metadata/bulk", async (req, res) => {
    const userIdString = (req.query.userIds ?? "[]") as string;
    const userIds = userIdString.slice(1, userIdString.length - 2).split(",");
    try {
        const metadata = await client.user.findMany({
            where: {
                id: {
                    in: userIds
                }
            },
            include: {
                avatar: true
            }
        })
        res.json({
            avatars: metadata.map((m) => ({
                userId: m.id,
                avatarUrl: m.avatar?.imageUrl
            }))
        })
    } catch (e) {
        res.status(500).json({message: "Internal server error"})
    }
})
