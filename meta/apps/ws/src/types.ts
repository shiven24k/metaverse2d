// ─── Incoming messages (client → server) ─────────────────────────────────────

type JoinMessage = {
    type: 'join';
    payload: { spaceId: string; token: string };
};

type MoveMessage = {
    type: 'move';
    payload: { x: number; y: number };
};

type EmoteMessage = {
    type: 'emote';
    payload: { emoji: string; x: number; y: number };
};

type InteractMessage = {
    type: 'interact';
    payload: { itemId: string; itemName: string; x: number; y: number };
};

type ChatIncomingMessage = {
    type: 'chat';
    payload: { message: string; x: number; y: number };
};

type AvatarChangedIncomingMessage = {
    type: 'avatar-changed';
    payload: { avatarId: string };
};

type GiftIncomingMessage = {
    type: 'gift';
    payload: { itemName: string; recipientUsername: string };
};

type EditorRelayIncoming = {
    type: 'element-placed' | 'item-placed' | 'element-deleted' | 'item-deleted' | 'element-moved' | 'item-moved';
    payload: Record<string, unknown>;
};

export type IncomingMessage =
    | JoinMessage
    | MoveMessage
    | EmoteMessage
    | InteractMessage
    | ChatIncomingMessage
    | AvatarChangedIncomingMessage
    | GiftIncomingMessage
    | EditorRelayIncoming;

// ─── Outgoing messages (server → client) ─────────────────────────────────────

type UserInfo = { userId: string; x: number; y: number; username: string; avatarId?: string };

type SpaceJoinedMessage = {
    type: 'space-joined';
    payload: {
        spawn: { x: number; y: number };
        userId: string;
        username: string;
        avatarId?: string;
        users: UserInfo[];
    };
};

type UserJoinedMessage = {
    type: 'user-joined';
    payload: UserInfo;
};

type UserLeftMessage = {
    type: 'user-left';
    payload: { userId?: string };
};

type MovementMessage = {
    type: 'movement';
    payload: { userId?: string; x: number; y: number };
};

type MovementRejectedMessage = {
    type: 'movement-rejected';
    payload: { x: number; y: number };
};

type EmotedMessage = {
    type: 'emoted';
    payload: { userId?: string; emoji: string; x: number; y: number };
};

type InteractedMessage = {
    type: 'interacted';
    payload: { userId?: string; itemId: string; itemName: string; x: number; y: number };
};

type ChatOutgoingMessage = {
    type: 'chat';
    payload: { userId?: string; username: string; message: string; x: number; y: number };
};

type GiftAnnounceMessage = {
    type: 'gift-announce';
    payload: { fromUsername: string; itemName: string; recipientUsername: string };
};

type AvatarChangedOutgoingMessage = {
    type: 'avatar-changed';
    payload: { userId?: string; avatarId: string };
};

type EditorRelayOutgoing = {
    type: 'element-placed' | 'item-placed' | 'element-deleted' | 'item-deleted' | 'element-moved' | 'item-moved';
    payload: Record<string, unknown>;
};

type NpcMovedMessage = {
    type: 'npc-moved';
    payload: { npcId: string; x: number; y: number };
};

export type OutgoingMessage =
    | SpaceJoinedMessage
    | UserJoinedMessage
    | UserLeftMessage
    | MovementMessage
    | MovementRejectedMessage
    | EmotedMessage
    | InteractedMessage
    | ChatOutgoingMessage
    | GiftAnnounceMessage
    | AvatarChangedOutgoingMessage
    | EditorRelayOutgoing
    | NpcMovedMessage;
