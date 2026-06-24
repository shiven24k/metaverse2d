import { WebSocket } from "ws";
import { getRoomManager } from "./getRoomManager";
import { IncomingMessage, OutgoingMessage } from "./types";
import client from "@repo/db/client";
import { auth } from "./lib/auth";
import { getBlockingCells, invalidateBlockingCache } from "./blockingCache";
import { ProximityChatManager } from "./proximityChatManager";
import { randomUUID } from "crypto";

// Conference room state — in-memory, ephemeral
const conferenceRooms = new Map<string, Set<string>>(); // roomId -> Set<userId>

// Broadcast zone state — in-memory, ephemeral
const broadcastZones = new Map<string, { speakerId: string | null; listeners: Set<string> }>();

function joinRoom(userId: string, roomId: string): string[] {
    if (!conferenceRooms.has(roomId)) conferenceRooms.set(roomId, new Set());
    const room = conferenceRooms.get(roomId)!;
    const existingPeers = [...room];
    room.add(userId);
    return existingPeers;
}

function leaveRoom(userId: string, roomId: string) {
    const room = conferenceRooms.get(roomId);
    if (!room) return;
    room.delete(userId);
    if (room.size === 0) conferenceRooms.delete(roomId);
}

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
    public role: string = 'User';
    private spaceId?: string;
    public x: number;
    public y: number;
    public currentRoomKey: string | null = null;
    public currentEmote: string | null = null;
    private currentConferenceRoomIds: Set<string> = new Set();
    private currentBroadcastZoneIds: Set<string> = new Set();
    private broadcastSpeakerInZones: Set<string> = new Set();
    public lastActivityAt: number = Date.now();
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

            console.log('[WS] incoming:', parsedData.type, 'from', this.userId ?? this.id);

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
                            select: { name: true, avatarId: true, role: true },
                        });
                        this.username = userRecord?.name ?? 'Unknown';
                        this.avatarId = userRecord?.avatarId ?? undefined;
                        this.role = userRecord?.role ?? 'User';
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
                    getRoomManager().broadcast(
                        {
                            type: 'notification',
                            payload: {
                                id: randomUUID(),
                                notifType: 'user-joined',
                                title: `${this.username} joined the space`,
                                message: '',
                                priority: 'normal',
                                fromUserId: this.userId ?? this.id,
                                fromUserName: this.username,
                                timestamp: Date.now(),
                            },
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
                    this.lastActivityAt = Date.now();
                    if (this.currentEmote === 'afk') {
                        this.currentEmote = null;
                        const chatSpaceUsers = getRoomManager().rooms.get(this.spaceId) ?? [];
                        const clearEmote: OutgoingMessage = { type: 'emote-broadcast', payload: { userId: this.userId ?? this.id, emoteId: '', expiresAt: 0 } };
                        for (const u of chatSpaceUsers) u.send(clearEmote);
                    }
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

                case 'rtc:offer':
                case 'rtc:answer':
                case 'rtc:ice': {
                    if (!this.spaceId || !this.userId) break;
                    const targetUserId = parsedData.to;
                    const spaceUsers = getRoomManager().rooms.get(this.spaceId) ?? [];
                    const targetUser = spaceUsers.find(u => (u.userId ?? u.id) === targetUserId);
                    if (!targetUser) break;
                    targetUser.send({
                        type: parsedData.type,
                        from: this.userId,
                        sdp: (parsedData as { sdp?: unknown }).sdp,
                        candidate: (parsedData as { candidate?: unknown }).candidate,
                    });
                    break;
                }

                case 'rtc:join-room': {
                    if (!this.userId) break;
                    const { roomId } = parsedData;
                    const existingPeers = joinRoom(this.userId, roomId);
                    this.currentConferenceRoomIds.add(roomId);
                    this.send({ type: 'rtc:room-peers', roomId, peers: existingPeers });
                    break;
                }

                case 'rtc:leave-room': {
                    if (!this.userId) break;
                    const { roomId: leaveRoomId } = parsedData;
                    leaveRoom(this.userId, leaveRoomId);
                    this.currentConferenceRoomIds.delete(leaveRoomId);
                    break;
                }

                case 'rtc:knock': {
                    console.log('[WS] rtc:knock from', this.userId ?? this.id, '→ to', parsedData.to);
                    if (!this.spaceId || !this.userId) {
                        console.log('[WS] rtc:knock aborted — spaceId:', this.spaceId, 'userId:', this.userId);
                        break;
                    }
                    const knockTarget = parsedData.to;
                    const knockSpaceUsers = getRoomManager().rooms.get(this.spaceId) ?? [];
                    // Log every userId the server knows about in this space so we can
                    // spot a key-format mismatch between what A sent and what B registered as.
                    console.log('[WS] known userIds in space', this.spaceId, ':', knockSpaceUsers.map(u => u.userId ?? u.id));
                    const knockTargetUser = knockSpaceUsers.find(u => (u.userId ?? u.id) === knockTarget);
                    // Translate the spec's getUserSocket concept: the target's WS readyState.
                    // ws is private but accessible within the same class body in TS.
                    console.log('[WS] target socket found:', !!knockTargetUser, 'readyState:', knockTargetUser?.ws.readyState);
                    if (!knockTargetUser) break;
                    knockTargetUser.send({ type: 'rtc:knock', from: this.userId, fromName: this.username, callType: parsedData.callType });
                    break;
                }

                case 'rtc:knock-accept':
                case 'rtc:knock-deny': {
                    console.log('[WS]', parsedData.type, 'from', this.userId ?? this.id, '→ to', parsedData.to);
                    if (!this.spaceId || !this.userId) {
                        console.log('[WS]', parsedData.type, 'aborted — spaceId:', this.spaceId, 'userId:', this.userId);
                        break;
                    }
                    const knockRespTarget = parsedData.to;
                    const knockRespSpaceUsers = getRoomManager().rooms.get(this.spaceId) ?? [];
                    console.log('[WS] known userIds for knock-resp:', knockRespSpaceUsers.map(u => u.userId ?? u.id));
                    const knockRespTargetUser = knockRespSpaceUsers.find(u => (u.userId ?? u.id) === knockRespTarget);
                    console.log('[WS] resp target found:', !!knockRespTargetUser, 'readyState:', knockRespTargetUser?.ws.readyState);
                    if (!knockRespTargetUser) break;
                    knockRespTargetUser.send({ type: parsedData.type, from: this.userId });
                    break;
                }

                case 'rtc:broadcast-zone-join': {
                    if (!this.userId || !this.spaceId) break;
                    const { zoneId, isSpeaker } = parsedData;
                    if (!broadcastZones.has(zoneId)) {
                        broadcastZones.set(zoneId, { speakerId: null, listeners: new Set() });
                    }
                    const zone = broadcastZones.get(zoneId)!;
                    const bzSpaceUsers = getRoomManager().rooms.get(this.spaceId) ?? [];

                    if (isSpeaker) {
                        zone.speakerId = this.userId;
                        this.broadcastSpeakerInZones.add(zoneId);
                        const listenerIds = [...zone.listeners];
                        this.send({ type: 'rtc:broadcast-zone-state', zoneId, speakerId: this.userId, listenerIds });
                        for (const listenerId of listenerIds) {
                            const listenerUser = bzSpaceUsers.find(u => (u.userId ?? u.id) === listenerId);
                            listenerUser?.send({ type: 'rtc:broadcast-zone-state', zoneId, speakerId: this.userId, listenerIds });
                        }
                    } else {
                        zone.listeners.add(this.userId);
                        this.currentBroadcastZoneIds.add(zoneId);
                        const listenerIds = [...zone.listeners];
                        this.send({ type: 'rtc:broadcast-zone-state', zoneId, speakerId: zone.speakerId, listenerIds });
                        if (zone.speakerId) {
                            const speakerUser = bzSpaceUsers.find(u => (u.userId ?? u.id) === zone.speakerId);
                            speakerUser?.send({ type: 'rtc:broadcast-zone-state', zoneId, speakerId: zone.speakerId, listenerIds });
                        }
                    }
                    break;
                }

                case 'rtc:broadcast-zone-leave': {
                    if (!this.userId || !this.spaceId) break;
                    const { zoneId: leaveZoneId } = parsedData;
                    this.leaveBroadcastZone(leaveZoneId);
                    break;
                }

                case "ping":
                    this.send({ type: "pong" });
                    break;

                case "announcement": {
                    if (this.role !== 'Admin' || !this.spaceId) break;
                    const { title, message: msg, priority } = parsedData.payload;
                    const senderId = this.userId ?? this.id;
                    const allUsers = getRoomManager().rooms.get(this.spaceId) ?? [];
                    const notif: OutgoingMessage = {
                        type: 'notification',
                        payload: {
                            id: randomUUID(),
                            notifType: 'announcement',
                            title,
                            message: msg,
                            priority,
                            fromUserId: senderId,
                            fromUserName: this.username,
                            timestamp: Date.now(),
                            urgentBanner: priority === 'urgent',
                        },
                    };
                    for (const u of allUsers) u.send(notif);
                    break;
                }

                case "ping-user": {
                    if (!this.spaceId) break;
                    const { targetUserId } = parsedData.payload;
                    const allUsers = getRoomManager().rooms.get(this.spaceId) ?? [];
                    const target = allUsers.find(u => (u.userId ?? u.id) === targetUserId);
                    if (!target) break;
                    const senderId = this.userId ?? this.id;
                    target.send({
                        type: 'notification',
                        payload: {
                            id: randomUUID(),
                            notifType: 'ping',
                            title: `${this.username} pinged you`,
                            message: 'Come join them!',
                            priority: 'normal',
                            fromUserId: senderId,
                            fromUserName: this.username,
                            timestamp: Date.now(),
                        },
                    });
                    this.send({
                        type: 'notification',
                        payload: {
                            id: randomUUID(),
                            notifType: 'ping',
                            title: 'Ping sent!',
                            message: `${target.username} has been notified.`,
                            priority: 'normal',
                            timestamp: Date.now(),
                        },
                    });
                    break;
                }

                case "status-emote": {
                    const VALID_EMOTE_IDS = new Set(['coffee', 'tea', 'yawn', 'stretch', 'afk', 'brb', '']);
                    const { emoteId } = parsedData.payload;
                    if (!VALID_EMOTE_IDS.has(emoteId) || !this.spaceId) break;
                    const persistent = emoteId === 'afk' || emoteId === 'brb' || emoteId === '';
                    const expiresAt = persistent ? 0 : Date.now() + 5000;
                    this.currentEmote = emoteId || null;
                    const emoteUsers = getRoomManager().rooms.get(this.spaceId) ?? [];
                    const emoteMsg: OutgoingMessage = {
                        type: 'emote-broadcast',
                        payload: { userId: this.userId ?? this.id, emoteId, expiresAt },
                    };
                    for (const u of emoteUsers) u.send(emoteMsg);
                    break;
                }

                case "notification-read":
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
            this.lastActivityAt = Date.now();
            if (this.currentEmote === 'afk' && this.spaceId) {
                this.currentEmote = null;
                const spaceUsers = getRoomManager().rooms.get(this.spaceId) ?? [];
                const clearEmote: OutgoingMessage = { type: 'emote-broadcast', payload: { userId: this.userId ?? this.id, emoteId: '', expiresAt: 0 } };
                for (const u of spaceUsers) u.send(clearEmote);
            }
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

    private leaveBroadcastZone(zoneId: string) {
        if (!this.userId || !this.spaceId) return;
        const zone = broadcastZones.get(zoneId);
        if (!zone) return;
        const bzSpaceUsers = getRoomManager().rooms.get(this.spaceId) ?? [];

        if (zone.speakerId === this.userId) {
            zone.speakerId = null;
            this.broadcastSpeakerInZones.delete(zoneId);
            const listenerIds = [...zone.listeners];
            for (const listenerId of listenerIds) {
                const listenerUser = bzSpaceUsers.find(u => (u.userId ?? u.id) === listenerId);
                listenerUser?.send({ type: 'rtc:broadcast-zone-state', zoneId, speakerId: null, listenerIds });
            }
        } else {
            zone.listeners.delete(this.userId);
            this.currentBroadcastZoneIds.delete(zoneId);
            const listenerIds = [...zone.listeners];
            if (zone.speakerId) {
                const speakerUser = bzSpaceUsers.find(u => (u.userId ?? u.id) === zone.speakerId);
                speakerUser?.send({ type: 'rtc:broadcast-zone-state', zoneId, speakerId: zone.speakerId, listenerIds });
            }
        }

        if (!zone.speakerId && zone.listeners.size === 0) broadcastZones.delete(zoneId);
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

        // Clean up conference rooms and notify remaining members
        if (this.userId) {
            for (const roomId of this.currentConferenceRoomIds) {
                const room = conferenceRooms.get(roomId);
                if (!room) continue;
                room.delete(this.userId);
                if (room.size === 0) {
                    conferenceRooms.delete(roomId);
                } else {
                    const spaceUsers = getRoomManager().rooms.get(this.spaceId) ?? [];
                    for (const memberId of room) {
                        const memberUser = spaceUsers.find(u => (u.userId ?? u.id) === memberId);
                        memberUser?.send({ type: 'rtc:peer-left', peerId: this.userId! });
                    }
                }
            }
            this.currentConferenceRoomIds.clear();

            // Notify proximity peers that this user disconnected
            const spaceUsers = getRoomManager().rooms.get(this.spaceId) ?? [];
            for (const u of spaceUsers) {
                if (u.id !== this.id) {
                    u.send({ type: 'rtc:peer-left', peerId: this.userId! });
                }
            }

            // Clean up broadcast zones
            for (const zoneId of [...this.broadcastSpeakerInZones, ...this.currentBroadcastZoneIds]) {
                this.leaveBroadcastZone(zoneId);
            }
        }

        getRoomManager().broadcast(
            { type: "user-left", payload: { userId: this.userId } },
            this,
            this.spaceId
        );
        getRoomManager().broadcast(
            {
                type: 'notification',
                payload: {
                    id: randomUUID(),
                    notifType: 'user-left',
                    title: `${this.username} left the space`,
                    message: '',
                    priority: 'normal',
                    fromUserId: this.userId ?? this.id,
                    fromUserName: this.username,
                    timestamp: Date.now(),
                },
            },
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
