import { createHash } from 'crypto';

export interface ChatMessage {
    id: string;
    roomId: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: number;
}

interface ChatRoom {
    messages: ChatMessage[];
    lastActivity: number;
}

const PROXIMITY_PX = 150;
const TILE_PX = 50;
const MAX_MESSAGES = 50;
const ROOM_TTL_MS = 30 * 60 * 1000;

export class ProximityChatManager {
    private static instance: ProximityChatManager;
    private rooms: Map<string, ChatRoom> = new Map();

    private constructor() {
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

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

    addMessage(roomId: string, message: ChatMessage): void {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, { messages: [], lastActivity: Date.now() });
        }
        const room = this.rooms.get(roomId)!;
        room.messages.push(message);
        room.lastActivity = Date.now();
        if (room.messages.length > MAX_MESSAGES) room.messages.shift();
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [roomId, room] of this.rooms) {
            if (now - room.lastActivity > ROOM_TTL_MS) this.rooms.delete(roomId);
        }
    }
}
