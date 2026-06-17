import { createHash } from 'crypto';
import client from '@repo/db/client';

const PROXIMITY_PX = 150;
const TILE_PX = 50;
const MAX_MESSAGES = 50;

export interface HistoryMessage {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    isSystem: boolean;
    timestamp: number;
}

export class ProximityChatManager {
    private static instance: ProximityChatManager;

    private constructor() {}

    static getInstance(): ProximityChatManager {
        if (!this.instance) this.instance = new ProximityChatManager();
        return this.instance;
    }

    static computeRoomId(playerIds: string[]): string {
        const sorted = [...playerIds].sort().join(',');
        return createHash('sha256').update(sorted).digest('hex').slice(0, 16);
    }

    static isInRange(x1: number, y1: number, x2: number, y2: number): boolean {
        const dx = (x1 - x2) * TILE_PX;
        const dy = (y1 - y2) * TILE_PX;
        return Math.sqrt(dx * dx + dy * dy) <= PROXIMITY_PX;
    }

    private async getOrCreateRoom(roomKey: string, spaceId: string): Promise<string> {
        const room = await client.proximityRoom.upsert({
            where: { roomKey },
            update: { updatedAt: new Date() },
            create: { roomKey, spaceId },
            select: { id: true },
        });
        return room.id;
    }

    async saveMessage(
        roomKey: string,
        spaceId: string,
        senderId: string,
        senderName: string,
        content: string,
        isSystem = false,
    ): Promise<string> {
        try {
            const roomDbId = await this.getOrCreateRoom(roomKey, spaceId);

            const created = await client.proximityChatMessage.create({
                data: { roomId: roomDbId, senderId, senderName, content, isSystem },
                select: { id: true },
            });

            console.log('[ProxChat] saved message', { roomKey, senderId, messageId: created.id });

            // Trim to MAX_MESSAGES oldest
            const all = await client.proximityChatMessage.findMany({
                where: { roomId: roomDbId },
                orderBy: { createdAt: 'asc' },
                select: { id: true },
            });
            if (all.length > MAX_MESSAGES) {
                const toDelete = all.slice(0, all.length - MAX_MESSAGES);
                await client.proximityChatMessage.deleteMany({
                    where: { id: { in: toDelete.map(m => m.id) } },
                });
            }

            return created.id;
        } catch (error) {
            console.error('[ProxChat] saveMessage failed', { roomKey, senderId }, error);
            throw error;
        }
    }

    async getHistory(roomKey: string, limit = 50): Promise<HistoryMessage[]> {
        const room = await client.proximityRoom.findUnique({
            where: { roomKey },
            select: { id: true },
        });
        if (!room) {
            console.log('[ProxChat] getHistory', { roomKey, count: 0, reason: 'room not in DB' });
            return [];
        }

        const messages = await client.proximityChatMessage.findMany({
            where: { roomId: room.id },
            orderBy: { createdAt: 'asc' },
            take: limit,
            select: { id: true, senderId: true, senderName: true, content: true, isSystem: true, createdAt: true },
        });

        console.log('[ProxChat] getHistory', { roomKey, count: messages.length });

        return messages.map(m => ({
            id: m.id,
            senderId: m.senderId,
            senderName: m.senderName,
            content: m.content,
            isSystem: m.isSystem,
            timestamp: m.createdAt.getTime(),
        }));
    }
}
