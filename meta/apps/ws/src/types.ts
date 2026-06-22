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

type ActivityChangedIncoming = {
    type: 'activity-changed';
    payload: { activity: 'sitting' | 'working' | null };
};

type PingMessage = {
    type: 'ping';
};

type ProximityChatIncoming = {
    type: 'chat-message';
    payload: { content: string };
};

type AnnouncementMessage = {
    type: 'announcement';
    payload: { title: string; message: string; priority: 'normal' | 'urgent' };
};

type PingUserMessage = {
    type: 'ping-user';
    payload: { targetUserId: string };
};

type NotificationReadMessage = {
    type: 'notification-read';
    payload: { notificationId: string };
};

type StatusEmoteIncoming = {
    type: 'status-emote';
    payload: { emoteId: 'coffee' | 'tea' | 'yawn' | 'stretch' | 'afk' | 'brb' | '' };
};

type RtcOfferIncoming = {
    type: 'rtc:offer';
    to: string;
    sdp: unknown;
};

type RtcAnswerIncoming = {
    type: 'rtc:answer';
    to: string;
    sdp: unknown;
};

type RtcIceIncoming = {
    type: 'rtc:ice';
    to: string;
    candidate: unknown;
};

type RtcJoinRoomIncoming = {
    type: 'rtc:join-room';
    roomId: string;
};

type RtcLeaveRoomIncoming = {
    type: 'rtc:leave-room';
    roomId: string;
};

export type IncomingMessage =
    | JoinMessage
    | MoveMessage
    | EmoteMessage
    | InteractMessage
    | ChatIncomingMessage
    | AvatarChangedIncomingMessage
    | GiftIncomingMessage
    | EditorRelayIncoming
    | ActivityChangedIncoming
    | PingMessage
    | ProximityChatIncoming
    | AnnouncementMessage
    | PingUserMessage
    | NotificationReadMessage
    | StatusEmoteIncoming
    | RtcOfferIncoming
    | RtcAnswerIncoming
    | RtcIceIncoming
    | RtcJoinRoomIncoming
    | RtcLeaveRoomIncoming;

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
    payload: { npcId: string; x: number; y: number; facing?: string };
};

type ActivityChangedOutgoing = {
    type: 'activity-changed';
    payload: { userId?: string; activity: 'sitting' | 'working' | null };
};

type PongMessage = {
    type: 'pong';
};

type NotificationOutgoing = {
    type: 'notification';
    payload: {
        id: string;
        notifType: 'announcement' | 'ping' | 'user-joined' | 'user-left' | 'mention';
        title: string;
        message: string;
        priority: 'normal' | 'urgent';
        fromUserId?: string;
        fromUserName?: string;
        timestamp: number;
        urgentBanner?: boolean;
    };
};

type ProximityChatMessage = {
    type: 'proximity-chat-message';
    payload: {
        id: string;
        roomId: string;
        senderId: string;
        senderName: string;
        content: string;
        timestamp: number;
    };
};

type ChatRoomUpdateMessage = {
    type: 'chat-room-update';
    payload: {
        roomId: string | null;
        members: { userId: string; username: string }[];
    };
};

type ChatHistoryMessage = {
    type: 'chat-history';
    payload: {
        roomId: string;
        messages: {
            id: string;
            senderId: string;
            senderName: string;
            content: string;
            isSystem: boolean;
            timestamp: number;
        }[];
    };
};

type EmoteBroadcastMessage = {
    type: 'emote-broadcast';
    payload: {
        userId: string;
        emoteId: string;
        expiresAt: number;
    };
};

type RtcRelayOutgoing = {
    type: 'rtc:offer' | 'rtc:answer' | 'rtc:ice';
    from: string;
    sdp?: unknown;
    candidate?: unknown;
};

type RtcRoomPeersOutgoing = {
    type: 'rtc:room-peers';
    roomId: string;
    peers: string[];
};

type RtcPeerLeftOutgoing = {
    type: 'rtc:peer-left';
    peerId: string;
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
    | NpcMovedMessage
    | ActivityChangedOutgoing
    | PongMessage
    | ProximityChatMessage
    | ChatRoomUpdateMessage
    | ChatHistoryMessage
    | NotificationOutgoing
    | EmoteBroadcastMessage
    | RtcRelayOutgoing
    | RtcRoomPeersOutgoing
    | RtcPeerLeftOutgoing;
