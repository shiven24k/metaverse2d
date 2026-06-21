import { create } from 'zustand';
import type { ProximityChatMessage, AppNotification } from '../types/game';

interface GameStore {
    // Proximity chat
    proximityChatMessages: ProximityChatMessage[];
    proximityChatRoomId: string | null;
    proximityChatMembers: { userId: string; username: string }[];
    proximityChatUnread: number;
    showProximityChat: boolean;
    proximityChatIsTyping: boolean;

    // Notifications
    notifications: AppNotification[];
    unreadCount: number;
    showNotifPanel: boolean;
    urgentBanner: AppNotification | null;
    notifToasts: AppNotification[];

    // Emotes
    activeEmotes: Map<string, { emoteId: string; expiresAt: number }>;
    myActiveEmote: string | null;
    showEmotePicker: boolean;

    // Actions — proximity chat
    setProximityChatMessages: (msgs: ProximityChatMessage[]) => void;
    addProximityChatMessage: (msg: ProximityChatMessage) => void;
    setProximityChatRoom: (roomId: string | null, members: { userId: string; username: string }[]) => void;
    incrementChatUnread: () => void;
    resetChatUnread: () => void;
    toggleProximityChat: () => void;
    setShowProximityChat: (show: boolean) => void;
    setProximityChatIsTyping: (isTyping: boolean) => void;

    // Actions — notifications
    addNotification: (n: AppNotification) => void;
    markNotificationRead: (id: string) => void;
    markAllRead: () => void;
    setUrgentBanner: (n: AppNotification | null) => void;
    addNotifToast: (n: AppNotification) => void;
    dismissToast: (id: string) => void;
    toggleNotifPanel: () => void;
    setShowNotifPanel: (show: boolean) => void;
    incrementUnreadCount: () => void;

    // Actions — emotes
    setMyActiveEmote: (emoteId: string | null) => void;
    setActiveEmote: (userId: string, emoteId: string, expiresAt: number) => void;
    clearActiveEmote: (userId: string) => void;
    toggleEmotePicker: () => void;
    setShowEmotePicker: (show: boolean) => void;
}

export const useGameStore = create<GameStore>((set) => ({
    // Proximity chat initial state
    proximityChatMessages: [],
    proximityChatRoomId: null,
    proximityChatMembers: [],
    proximityChatUnread: 0,
    showProximityChat: true,
    proximityChatIsTyping: false,

    // Notifications initial state
    notifications: [],
    unreadCount: 0,
    showNotifPanel: false,
    urgentBanner: null,
    notifToasts: [],

    // Emotes initial state
    activeEmotes: new Map(),
    myActiveEmote: null,
    showEmotePicker: false,

    // Proximity chat actions
    setProximityChatMessages: (msgs) => set({ proximityChatMessages: msgs }),
    addProximityChatMessage: (msg) => set((s) => ({ proximityChatMessages: [...s.proximityChatMessages, msg] })),
    setProximityChatRoom: (roomId, members) => set({ proximityChatRoomId: roomId, proximityChatMembers: members }),
    incrementChatUnread: () => set((s) => ({ proximityChatUnread: s.proximityChatUnread + 1 })),
    resetChatUnread: () => set({ proximityChatUnread: 0 }),
    toggleProximityChat: () => set((s) => ({
        showProximityChat: !s.showProximityChat,
        proximityChatUnread: !s.showProximityChat ? 0 : s.proximityChatUnread,
    })),
    setShowProximityChat: (show) => set({ showProximityChat: show }),
    setProximityChatIsTyping: (isTyping) => set({ proximityChatIsTyping: isTyping }),

    // Notification actions
    addNotification: (n) => set((s) => ({ notifications: [n, ...s.notifications].slice(0, 50) })),
    markNotificationRead: (id) => set((s) => ({
        notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
    })),
    markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
    setUrgentBanner: (n) => set({ urgentBanner: n }),
    addNotifToast: (n) => set((s) => ({ notifToasts: [n, ...s.notifToasts].slice(0, 3) })),
    dismissToast: (id) => set((s) => ({ notifToasts: s.notifToasts.filter((t) => t.id !== id) })),
    toggleNotifPanel: () => set((s) => ({ showNotifPanel: !s.showNotifPanel, unreadCount: !s.showNotifPanel ? 0 : s.unreadCount })),
    setShowNotifPanel: (show) => set({ showNotifPanel: show }),
    incrementUnreadCount: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),

    // Emote actions
    setMyActiveEmote: (emoteId) => set({ myActiveEmote: emoteId }),
    setActiveEmote: (userId, emoteId, expiresAt) => set((s) => {
        const next = new Map(s.activeEmotes);
        next.set(userId, { emoteId, expiresAt });
        return { activeEmotes: next };
    }),
    clearActiveEmote: (userId) => set((s) => {
        const next = new Map(s.activeEmotes);
        next.delete(userId);
        return { activeEmotes: next };
    }),
    toggleEmotePicker: () => set((s) => ({ showEmotePicker: !s.showEmotePicker })),
    setShowEmotePicker: (show) => set({ showEmotePicker: show }),
}));
