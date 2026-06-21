import { Smile, MessageCircle } from 'lucide-react';
import { EmotePicker } from './EmotePicker';

interface GameDockProps {
    showChat: boolean;
    onToggleChat: () => void;
    chatUnread: number;
    showEmotePicker: boolean;
    onToggleEmotePicker: () => void;
    avatarId: string;
    activeEmote: string | null;
    onEmote: (emoteId: string) => void;
}

export function GameDock({
    showChat, onToggleChat, chatUnread,
    showEmotePicker, onToggleEmotePicker,
    avatarId, activeEmote, onEmote,
}: GameDockProps) {
    return (
        <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 50, display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid #ecebf3', borderRadius: 999, padding: 5, boxShadow: '0 1px 2px rgba(22,15,52,0.04), 0 6px 16px rgba(22,15,52,0.07)' }}>
            {/* Emote button */}
            <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                <button
                    title="Emotes (E)"
                    onClick={onToggleEmotePicker}
                    style={{ width: 38, height: 38, borderRadius: 999, border: showEmotePicker ? '1px solid #e7ddfb' : '1px solid transparent', background: showEmotePicker ? '#f4f0fe' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: showEmotePicker ? '#5b21b6' : '#6f6b82', position: 'relative' }}
                >
                    <Smile size={18} />
                </button>
                {showEmotePicker && (
                    <EmotePicker
                        avatarId={avatarId}
                        activeEmote={activeEmote}
                        onEmote={onEmote}
                        onClose={onToggleEmotePicker}
                    />
                )}
            </div>

            <div style={{ width: 1, height: 22, background: '#ecebf3', margin: '0 2px' }} />

            {/* Chat button */}
            <button
                onClick={onToggleChat}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 13px', height: 38, borderRadius: 999, border: showChat ? '1px solid #e7ddfb' : '1px solid transparent', background: showChat ? '#f4f0fe' : 'transparent', color: showChat ? '#5b21b6' : '#4d495f', fontSize: 13, fontWeight: 600, cursor: 'pointer', position: 'relative' }}
            >
                <MessageCircle size={16} />Chat
                {chatUnread > 0 && !showChat && (
                    <span style={{ position: 'absolute', top: 4, right: 4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {chatUnread > 9 ? '9+' : chatUnread}
                    </span>
                )}
            </button>

            <div style={{ width: 1, height: 22, background: '#ecebf3', margin: '0 2px' }} />

            {/* Hint */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', fontSize: 11.5, color: '#a3a0b3', fontWeight: 500, whiteSpace: 'nowrap' }}>
                Arrows to move · F to interact
            </span>
        </div>
    );
}
