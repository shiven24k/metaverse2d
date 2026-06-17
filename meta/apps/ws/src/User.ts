import { WebSocket } from "ws";
import { getRoomManager } from "./getRoomManager";
import { IncomingMessage, OutgoingMessage } from "./types";
import client from "@repo/db/client";
import { auth } from "./lib/auth";
import { getBlockingCells, invalidateBlockingCache } from "./blockingCache";
import { ProximityChatManager } from "./proximityChatManager";
import { randomUUID } from "crypto";

async function findNearestWalkable(
    x: number, y: number,
    spaceId: string,
    spaceW: number, spaceH: number,
): Promise<{ x: number; y: number }> {
    const blocked = await getBlockingCells(spaceId);
    if (!blocked.has(`${x},${y}`)) return { x, y };
    for (let r = 1; r <= 10; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= spaceW || ny >= spaceH) continue;
                if (!blocked.has(`${nx},${ny}`)) return { x: nx, y: ny };
            }
        }
    }
    return { x, y };
}

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
    public currentRoomKey: string | null = null;
    private ws: WebSocket;
    private lastMove: Promise<void> = Promise.resolve();

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
                        this.currentRoomKey = null;
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

                    const safePos = await findNearestWalkable(this.x, this.y, spaceId, space.width, space.height);
                    this.x = safePos.x;
                    this.y = safePos.y;

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
                    this.broadcastRoomUpdates(spaceId);
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

                case "chat-message": {
                    const { content } = parsedData.payload;
                    if (!content || typeof content !== 'string' || !content.trim() || !this.spaceId) break;
                    const allUsers = getRoomManager().rooms.get(this.spaceId) ?? [];
                    const nearbyUsers = allUsers.filter(u =>
                        u.id !== this.id &&
                        ProximityChatManager.isInRange(this.x, this.y, u.x, u.y)
                    );
                    if (nearbyUsers.length === 0) break;
                    const participantIds = [this.userId ?? this.id, ...nearbyUsers.map(u => u.userId ?? u.id)];
                    const roomKey = ProximityChatManager.computeRoomId(participantIds);
                    const trimmedContent = content.trim();
                    const timestamp = Date.now();
                    const senderId = this.userId ?? this.id;
                    // Persist to DB (fire-and-forget, use DB-assigned id when available)
                    const spaceId = this.spaceId;
                    ProximityChatManager.getInstance()
                        .saveMessage(roomKey, spaceId, senderId, this.username, trimmedContent)
                        .then(dbId => {
                            const outgoing: OutgoingMessage = {
                                type: 'proximity-chat-message',
                                payload: { id: dbId, roomId: roomKey, senderId, senderName: this.username, content: trimmedContent, timestamp },
                            };
                            for (const u of nearbyUsers) u.send(outgoing);
                        })
                        .catch((err) => {
                            console.error('[ProxChat] saveMessage failed, broadcasting without persistence', { roomKey, senderId }, err);
                            // Fallback: broadcast with random id if DB write fails
                            const outgoing: OutgoingMessage = {
                                type: 'proximity-chat-message',
                                payload: { id: randomUUID(), roomId: roomKey, senderId, senderName: this.username, content: trimmedContent, timestamp },
                            };
                            for (const u of nearbyUsers) u.send(outgoing);
                        });
                    break;
                }

                case "ping":
                    this.send({ type: "pong" });
                    break;

                case "move": {
                    const moveX = parsedData.payload.x;
                    const moveY = parsedData.payload.y;
                    // Chain moves serially so concurrent WS messages can't race against
                    // an in-flight async getBlockingCells / DB call and read stale this.x/y.
                    this.lastMove = this.lastMove
                        .then(() => this.processMove(moveX, moveY))
                        .catch(() => {});
                    break;
                }
            }
        });
    }

    private async processMove(moveX: number, moveY: number): Promise<void> {
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
                    return;
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
            if (this.spaceId) this.broadcastRoomUpdates(this.spaceId);
            return;
        }

        this.send({ type: "movement-rejected", payload: { x: this.x, y: this.y } });
    }

    private broadcastRoomUpdates(spaceId: string): void {
        // Fire-and-forget the async work so callers don't need to await
        this._broadcastRoomUpdatesAsync(spaceId).catch(() => {});
    }

    private async _broadcastRoomUpdatesAsync(spaceId: string): Promise<void> {
        const allUsers = getRoomManager().rooms.get(spaceId) ?? [];
        for (const u of allUsers) {
            const nearby = allUsers.filter(other =>
                other.id !== u.id &&
                ProximityChatManager.isInRange(u.x, u.y, other.x, other.y)
            );
            const roomKey = nearby.length > 0
                ? ProximityChatManager.computeRoomId([
                    u.userId ?? u.id,
                    ...nearby.map(o => o.userId ?? o.id),
                ])
                : null;
            const members = nearby.map(o => ({ userId: o.userId ?? o.id, username: o.username }));

            // Always send room update so member list stays current
            u.send({ type: 'chat-room-update', payload: { roomId: roomKey, members } });

            // Send history only when the room key changes for this user
            if (roomKey !== u.currentRoomKey) {
                u.currentRoomKey = roomKey;
                if (roomKey !== null) {
                    try {
                        const history = await ProximityChatManager.getInstance().getHistory(roomKey);
                        console.log('[ProxChat] sending chat-history to', u.userId ?? u.id, 'roomKey:', roomKey, 'messages:', history.length);
                        u.send({ type: 'chat-history', payload: { roomId: roomKey, messages: history } });
                    } catch (error) {
                        console.error('[ProxChat] getHistory failed for', u.userId ?? u.id, 'roomKey:', roomKey, error);
                        // Reset so the next move triggers a retry
                        u.currentRoomKey = null;
                        // Send empty history so frontend shows "You joined" instead of hanging blank
                        u.send({ type: 'chat-history', payload: { roomId: roomKey, messages: [] } });
                    }
                }
            }
        }
    }

    destroy() {
        if (!this.spaceId) return; // disconnected before completing join
        getRoomManager().broadcast(
            { type: "user-left", payload: { userId: this.userId } },
            this,
            this.spaceId
        );
        const spaceId = this.spaceId;
        this.currentRoomKey = null;
        getRoomManager().removeUser(this, spaceId);
        this.broadcastRoomUpdates(spaceId);
    }

    send(payload: OutgoingMessage) {
        this.ws.send(JSON.stringify(payload));
    }
}
