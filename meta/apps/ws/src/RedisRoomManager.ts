import Redis from "ioredis";
import type { User } from "./User";
import { OutgoingMessage } from "./types";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const ROOM_PREFIX = "room:";

export class RedisRoomManager {
    rooms: Map<string, User[]> = new Map();
    static instance: RedisRoomManager;
    private pub: Redis;
    private sub: Redis;
    private instanceId: string;

    private constructor() {
        this.instanceId = Math.random().toString(36).substring(2, 10);
        this.pub = new Redis(REDIS_URL);
        this.sub = new Redis(REDIS_URL);
        this.sub.on("message", (channel, message) => {
            const spaceId = channel.startsWith(ROOM_PREFIX) ? channel.slice(ROOM_PREFIX.length) : channel;
            let parsed: any;
            try {
                parsed = JSON.parse(message);
            } catch { return; }

            const { _senderUserId, _instanceId, ...payload } = parsed;
            if (_instanceId === this.instanceId) return;

            const users = this.rooms.get(spaceId);
            if (!users) return;

            const outgoing = payload as OutgoingMessage;
            users.forEach((u) => {
                if (u.userId !== _senderUserId) {
                    u.send(outgoing);
                }
            });
        });
    }

    static getInstance() {
        if (!this.instance) {
            this.instance = new RedisRoomManager();
        }
        return this.instance;
    }

    public addUser(spaceId: string, user: User) {
        if (!this.rooms.has(spaceId)) {
            this.rooms.set(spaceId, [user]);
            this.sub.subscribe(`${ROOM_PREFIX}${spaceId}`);
        } else {
            this.rooms.set(spaceId, [...(this.rooms.get(spaceId) ?? []), user]);
        }
    }

    public removeUser(user: User, spaceId: string) {
        if (!this.rooms.has(spaceId)) return;
        const remaining = this.rooms.get(spaceId)?.filter((u) => u.id !== user.id) ?? [];
        if (remaining.length === 0) {
            this.rooms.delete(spaceId);
            this.sub.unsubscribe(`${ROOM_PREFIX}${spaceId}`);
        } else {
            this.rooms.set(spaceId, remaining);
        }
    }

    public broadcast(message: OutgoingMessage, user: User, roomId: string) {
        if (this.rooms.has(roomId)) {
            this.rooms.get(roomId)?.forEach((u) => {
                if (u.id !== user.id) {
                    u.send(message);
                }
            });
        }

        this.pub.publish(
            `${ROOM_PREFIX}${roomId}`,
            JSON.stringify({ ...message, _senderUserId: user.userId, _instanceId: this.instanceId })
        );
    }
}
