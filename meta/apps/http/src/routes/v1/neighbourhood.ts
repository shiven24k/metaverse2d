import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import client from "@repo/db/client";

export const neighbourhoodRouter = Router();

neighbourhoodRouter.get("/", userMiddleware, async (req, res) => {
    let member = await client.neighbourhoodMember.findUnique({
        where: { userId: req.userId },
        include: {
            neighbourhood: {
                include: {
                    members: {
                        include: {
                            user: { select: { id: true, username: true, name: true, avatarId: true } },
                        },
                    },
                },
            },
        },
    });

    if (!member) {
        const count = await client.neighbourhoodMember.count();
        const hoodIndex = Math.floor(count / 8);
        const name = `Neighbourhood #${hoodIndex + 1}`;

        let hood = await client.neighbourhood.findFirst({ where: { name } });
        if (!hood) {
            hood = await client.neighbourhood.create({ data: { name } });
        }

        member = await client.neighbourhoodMember.create({
            data: { neighbourhoodId: hood.id, userId: req.userId! },
            include: {
                neighbourhood: {
                    include: {
                        members: {
                            include: {
                                user: { select: { id: true, username: true, name: true, avatarId: true } },
                            },
                        },
                    },
                },
            },
        });
    }

    res.json({
        neighbourhood: {
            id: member.neighbourhood.id,
            name: member.neighbourhood.name,
            members: member.neighbourhood.members.map(m => ({
                id: m.user.id,
                username: m.user.username ?? m.user.name,
            })),
        },
    });
});
