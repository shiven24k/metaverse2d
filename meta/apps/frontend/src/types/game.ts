export type SpaceEdge = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export interface SpacePortal {
    id: string;
    toSpaceId: string;
    fromEdge: SpaceEdge;
    toEdge: SpaceEdge;
    label: string;
}

export interface SpaceElement {
    id: string;
    element: {
        id: string;
        imageUrl: string;
        width: number;
        height: number;
        static: boolean;
        blocking: boolean;
    };
    x: number;
    y: number;
    failedToSave?: boolean;
}

export interface PlacedItem {
    id: string;
    item: {
        id: string;
        name: string;
        imageUrl: string;
        width: number;
        height: number;
        blocking: boolean;
    };
    x: number;
    y: number;
    layer: string;
    metadata?: { text?: string } | null;
    failedToSave?: boolean;
}

export interface NPC {
    id: string;
    name: string;
    sprite: string;
    dialogues: string[];
    x: number;
    y: number;
    motionType: 'STATIC' | 'PATROL' | 'WANDER';
    wanderRadius: number;
}

export interface Player {
    userId: string;
    username: string;
    x: number;
    y: number;
    avatarId?: string;
}

export type OtherUser = Player;

export interface ProximityChatMessage {
    id: string;
    roomId: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: number;
    isSystem?: boolean;
    isDivider?: boolean;
}

export interface AppNotification {
    id: string;
    notifType: 'announcement' | 'ping' | 'user-joined' | 'user-left' | 'mention';
    title: string;
    message: string;
    priority: 'normal' | 'urgent';
    fromUserId?: string;
    fromUserName?: string;
    timestamp: number;
    urgentBanner?: boolean;
    read: boolean;
}

export interface ActiveEmote {
    emoteId: string;
    expiresAt: number;
}

export type EmoteId = string;
