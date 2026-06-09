import { Router } from "express";
import client from "@repo/db/client";
import { userMiddleware } from "../../middleware/user";

export const inviteRouter = Router();

// GET /invite/:token — validate token, return space info (public)
inviteRouter.get("/:token", async (req, res) => {
    const invite = await client.spaceInvite.findUnique({
        where: { token: req.params.token },
        include: {
            space: {
                select: {
                    id: true,
                    name: true,
                    width: true,
                    height: true,
                    isPrivate: true,
                    _count: { select: { members: true } },
                },
            },
        },
    });

    if (!invite) { res.status(404).json({ message: "Invite not found" }); return; }
    if (invite.expiresAt && invite.expiresAt < new Date()) { res.status(410).json({ message: "Invite expired" }); return; }
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) { res.status(410).json({ message: "Invite has reached max uses" }); return; }

    res.json({
        spaceId: invite.spaceId,
        spaceName: invite.space.name,
        memberCount: invite.space._count.members,
        dimensions: `${invite.space.width}x${invite.space.height}`,
    });
});

// POST /invite/:token/join — join space via invite token
inviteRouter.post("/:token/join", userMiddleware, async (req, res) => {
    const invite = await client.spaceInvite.findUnique({
        where: { token: req.params.token },
    });

    if (!invite) { res.status(404).json({ message: "Invite not found" }); return; }
    if (invite.expiresAt && invite.expiresAt < new Date()) { res.status(410).json({ message: "Invite expired" }); return; }
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) { res.status(410).json({ message: "Invite has reached max uses" }); return; }

    await client.$transaction(async (tx) => {
        await tx.spaceMember.upsert({
            where: { spaceId_userId: { spaceId: invite.spaceId, userId: req.userId! } },
            create: { spaceId: invite.spaceId, userId: req.userId!, role: "MEMBER" },
            update: {},
        });
        await tx.spaceInvite.update({
            where: { id: invite.id },
            data: { useCount: { increment: 1 } },
        });
    });

    res.json({ spaceId: invite.spaceId });
});
