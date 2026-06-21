import { useState, useRef, useEffect } from 'react';
import type { ProximityChatMessage } from '../../types/game';

interface ProximityChatPanelProps {
    messages: ProximityChatMessage[];
    roomId: string | null;
    members: { userId: string; username: string }[];
    unread: number;
    onSend: (text: string) => void;
    onClose: () => void;
    isDesktop: boolean;
    currentUserId: string;
    onTypingChange?: (isTyping: boolean) => void;
}

export function ProximityChatPanel({
    messages, roomId, members, onSend, onClose, isDesktop, currentUserId, onTypingChange,
}: ProximityChatPanelProps) {
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    const handleInput = (val: string) => {
        setInputValue(val);
        onTypingChange?.(val.length > 0);
    };

    const handleSend = () => {
        const trimmed = inputValue.trim();
        if (!trimmed || !roomId) return;
        onSend(trimmed);
        setInputValue('');
        onTypingChange?.(false);
    };

    const panelStyle: React.CSSProperties = isDesktop ? {
        position: 'fixed', top: 56, left: 12, width: 280,
        height: 'calc(100vh - 80px)', zIndex: 50,
        display: 'flex', flexDirection: 'column',
        background: '#ffffff', borderRadius: 16,
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    } : {
        position: 'fixed', bottom: 0, left: 0, right: 0, width: '100%',
        height: '55vh', zIndex: 50,
        display: 'flex', flexDirection: 'column',
        background: '#ffffff', borderRadius: '16px 16px 0 0',
        border: '1px solid #e5e7eb',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
    };

    return (
        <div style={panelStyle}>
            {/* Mobile drag handle */}
            {!isDesktop && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px', flexShrink: 0 }}>
                    <div style={{ width: 32, height: 4, borderRadius: 2, background: '#d1d5db' }} />
                </div>
            )}

            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15 }}>💬</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111', flex: 1 }}>Nearby Chat</span>
                    {roomId && members.length === 1 && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#ede9fe', color: '#6d28d9', borderRadius: 999, padding: '2px 8px' }}>Private</span>
                    )}
                    {roomId && members.length >= 2 && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#e0f2fe', color: '#0369a1', borderRadius: 999, padding: '2px 8px' }}>Group · {members.length + 1}</span>
                    )}
                    <button
                        onClick={onClose}
                        style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: '#f3f4f6', color: '#6b7280', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >✕</button>
                </div>
                {roomId && members.length > 0 && (
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {members.map((m) => m.username).join(', ')}
                    </div>
                )}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {!roomId ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20, gap: 8 }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>Move closer to someone</p>
                    </div>
                ) : messages.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Say something!</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isSelf = msg.senderId === currentUserId;
                        const isGroup = members.length >= 2;
                        if (msg.isDivider) {
                            return (
                                <div key={msg.id} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                                    <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                                    <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>Earlier messages</span>
                                    <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                                </div>
                            );
                        }
                        if (msg.isSystem) {
                            return (
                                <div key={msg.id} style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', margin: '8px 0' }}>
                                    {msg.content}
                                </div>
                            );
                        }
                        return (
                            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isSelf ? 'flex-end' : 'flex-start', gap: 2 }}>
                                {!isSelf && isGroup && (
                                    <span style={{ fontSize: 11, color: '#6b7280', paddingLeft: 4 }}>{msg.senderName}</span>
                                )}
                                <div
                                    style={{
                                        alignSelf: isSelf ? 'flex-end' : 'flex-start',
                                        maxWidth: '75%', padding: '7px 12px',
                                        borderRadius: isSelf ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                        background: isSelf ? '#6d28d9' : '#f3f4f6',
                                        color: isSelf ? '#fff' : '#111827',
                                        fontSize: 13, lineHeight: 1.4, wordBreak: 'break-word',
                                        opacity: 1,
                                    }}
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.92'; }}
                                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                                >
                                    {msg.content}
                                </div>
                                <span style={{ alignSelf: isSelf ? 'flex-end' : 'flex-start', fontSize: 10, color: '#9ca3af', paddingLeft: isSelf ? 0 : 4, paddingRight: isSelf ? 4 : 0 }}>
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} style={{ paddingBottom: 8 }} />
            </div>

            {/* Input row */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    value={inputValue}
                    onChange={(e) => handleInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
                    placeholder={roomId ? 'Message nearby people...' : 'Move closer to chat'}
                    disabled={!roomId}
                    maxLength={200}
                    style={{
                        flex: 1, border: '1px solid #e5e7eb', borderRadius: 20,
                        padding: '8px 14px', fontSize: 13, outline: 'none',
                        color: '#111', background: '#fff',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#6d28d9'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                />
                <button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || !roomId}
                    style={{
                        width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
                        background: inputValue.trim() && roomId ? '#6d28d9' : '#e5e7eb',
                        color: inputValue.trim() && roomId ? '#fff' : '#9ca3af',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
                    }}
                >→</button>
            </div>
        </div>
    );
}
