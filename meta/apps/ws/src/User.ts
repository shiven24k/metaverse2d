import { WebSocket } from "ws";
import { getRoomManager } from "./getRoomManager";
import { IncomingMessage, OutgoingMessage } from "./types";
import client from "@repo/db/client";
import { auth } from "./lib/auth";
import { getBlockingCells, invalidateBlockingCache } from "./blockingCache";

function getRandomString(length: number) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

export class User {
    public id: string;
    public userId?: string;
    public username: string;
    public avatarId?: string;
    public isGuest: boolean;
    private spaceId?: string;
    public x: number;
    public y: number;
    private ws: WebSocket;

    constructor(ws: WebSocket) {
        this.id = getRandomString(10);
        this.username = 'Unknown';
        this.x = 0;
        this.y = 0;
        this.isGuest = false;
        this.ws = ws;
        this.initHandlers();
    }

    initHandlers() {
        this.ws.on("message", async (data) => {
            let parsedData: IncomingMessage;
            try {
                parsedData = JSON.parse(data.toString()) as IncomingMessage;
            } catch {
                return;
            }

            switch (parsedData.type) {
                case "join": {
                    // Guard against re-join: clean up old room membership first
                    if (this.spaceId) {
                        getRoomManager().removeUser(this, this.spaceId);
                        this.spaceId = undefined;
                    }

                    const spaceId = parsedData.payload.spaceId;
                    const token = parsedData.payload.token;

                    if (!token) {
                        // Guest: no token → assign temp identity, skip DB auth
                        this.isGuest = true;
                        this.userId = `guest-${this.id}`;
                        this.username = `Guest-${getRandomString(4)}`;
                        this.avatarId = 'avatar-intern';
                    } else {
                        let userId: string | undefined;
                        try {
                            const session = await auth.api.getSession({
                                headers: new Headers({
                                    authorization: `Bearer ${token}`,
                                }),
                            });
                            userId = session?.user?.id;
                        } catch {
                            this.ws.close();
                            return;
                        }

                        if (!userId) {
                            this.ws.close();
                            return;
                        }

                        this.userId = userId;

                        const banned = await client.bannedUser.findUnique({
                            where: { userId },
                        });
                        if (banned) {
                            this.ws.close();
                            return;
                        }

                        const userRecord = await client.user.findUnique({
                            where: { id: userId },
                            select: { name: true, avatarId: true },
                        });
                        this.username = userRecord?.name ?? 'Unknown';
                        this.avatarId = userRecord?.avatarId ?? undefined;
                    }

                    const space = await client.space.findFirst({
                        where: { id: spaceId },
                    });

                    if (!space) {
                        this.ws.close();
                        return;
                    }

                    if (space.isPrivate) {
                        if (this.isGuest || !this.userId) {
                            this.ws.close();
                            return;
                        }
                        const member = await client.spaceMember.findUnique({
                            where: { spaceId_userId: { spaceId, userId: this.userId } },
                        });
                        if (!member) {
                            this.ws.close();
                            return;
                        }
                    }

                    this.spaceId = spaceId;
                    getRoomManager().addUser(spaceId, this);
                    this.x = Math.floor(Math.random() * space.width);
                    this.y = Math.floor(Math.random() * space.height);

                    const allUsers =
                        getRoomManager()
                            .rooms.get(spaceId)
                            ?.filter((u) => u.id !== this.id)
                            ?.map((u) => ({ userId: u.userId ?? u.id, x: u.x, y: u.y, username: u.username, avatarId: u.avatarId })) ?? [];

                    this.send({
                        type: "space-joined",
                        payload: {
                            spawn: { x: this.x, y: this.y },
                            userId: this.userId!,
                            username: this.username,
                            avatarId: this.avatarId,
                            users: allUsers,
                        },
                    });

                    getRoomManager().broadcast(
                        {
                            type: "user-joined",
                            payload: { userId: this.userId!, x: this.x, y: this.y, username: this.username, avatarId: this.avatarId },
                        },
                        this,
                        this.spaceId!
                    );
                    break;
                }

                case "emote": {
                    const { emoji, x, y } = parsedData.payload;
                    if (typeof emoji === "string" && emoji.length > 0) {
                        getRoomManager().broadcast(
                            {
                                type: "emoted",
                                payload: { userId: this.userId, emoji, x, y },
                            },
                            this,
                            this.spaceId!
                        );
                    }
                    break;
                }

                case "interact": {
                    const { itemId, itemName, x, y } = parsedData.payload;
                    if (itemId && itemName) {
                        getRoomManager().broadcast(
                            {
                                type: "interacted",
                                payload: { userId: this.userId, itemId, itemName, x, y },
                            },
                            this,
                            this.spaceId!
                        );
                    }
                    break;
                }

                case "chat": {
                    const { message, x: chatX, y: chatY } = parsedData.payload;
                    if (message && typeof message === "string" && message.trim().length > 0) {
                        getRoomManager().broadcast(
                            {
                                type: "chat",
                                payload: { userId: this.userId, username: this.username, message: message.trim(), x: chatX, y: chatY },
                            },
                            this,
                            this.spaceId!
                        );
                    }
                    break;
                }

                case "avatar-changed": {
                    const { avatarId } = parsedData.payload;
                    if (typeof avatarId === "string" && avatarId.length > 0) {
                        this.avatarId = avatarId;
                        getRoomManager().broadcast(
                            {
                                type: "avatar-changed",
                                payload: { userId: this.userId, avatarId },
                            },
                            this,
                            this.spaceId!
                        );
                    }
                    break;
                }

                case "element-placed":
                case "item-placed":
                case "element-deleted":
                case "item-deleted":
                case "element-moved":
                case "item-moved": {
                    if (this.spaceId) invalidateBlockingCache(this.spaceId);
                    getRoomManager().broadcast(
                        {
                            type: parsedData.type,
                            payload: { ...parsedData.payload, userId: this.userId },
                        } as OutgoingMessage,
                        this,
                        this.spaceId!
                    );
                    break;
                }

                case "gift": {
                    const { itemName, recipientUsername } = parsedData.payload;
                    if (itemName && recipientUsername && this.userId) {
                        getRoomManager().broadcast(
                            {
                                type: "gift-announce",
                                payload: { fromUsername: this.username, itemName, recipientUsername },
                            },
                            this,
                            this.spaceId!
                        );
                    }
                    break;
                }

                case "activity-changed": {
                    const { activity } = parsedData.payload;
                    if (activity === null || activity === 'sitting' || activity === 'working') {
                        getRoomManager().broadcast(
                            {
                                type: "activity-changed",
                                payload: { userId: this.userId, activity },
                            },
                            this,
                            this.spaceId!
                        );
                    }
                    break;
                }

                case "ping":
                    this.send({ type: "pong" });
                    break;

                case "move": {
                    const moveX = parsedData.payload.x;
                    const moveY = parsedData.payload.y;
                    const xDisplacement = Math.abs(this.x - moveX);
                    const yDisplacement = Math.abs(this.y - moveY);

                    if (
                        (xDisplacement === 1 && yDisplacement === 0) ||
                        (xDisplacement === 0 && yDisplacement === 1)
                    ) {
                        if (this.spaceId) {
                            const blocked = await getBlockingCells(this.spaceId);
                            if (blocked.has(`${moveX},${moveY}`)) {
                                this.send({ type: "movement-rejected", payload: { x: this.x, y: this.y } });
                                break;
                            }
                        }
                        this.x = moveX;
                        this.y = moveY;
                        getRoomManager().broadcast(
                            {
                                type: "movement",
                                payload: { userId: this.userId, x: this.x, y: this.y },
                            },
                            this,
                            this.spaceId!
                        );
                        return;
                    }

                    this.send({
                        type: "movement-rejected",
                        payload: { x: this.x, y: this.y },
                    });
                    break;
                }
            }
        });
    }

    destroy() {
        if (!this.spaceId) return; // disconnected before completing join
        getRoomManager().broadcast(
            { type: "user-left", payload: { userId: this.userId } },
            this,
            this.spaceId
        );
        getRoomManager().removeUser(this, this.spaceId);
    }

    send(payload: OutgoingMessage) {
        this.ws.send(JSON.stringify(payload));
    }
}
