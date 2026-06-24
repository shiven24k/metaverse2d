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
    // Call buttons
    nearbyPeers: { userId: string; username: string }[];
    pendingKnockPeerIds: Set<string>;
    onCallVoice: (peerId: string) => void;
    onCallVideo: (peerId: string) => void;
    onCancelCall: (peerId: string) => void;
    topOffset?: number;
}

export function ProximityChatPanel({
    messages, roomId, members, onSend, onClose, isDesktop, currentUserId, onTypingChange,
    nearbyPeers, pendingKnockPeerIds, onCallVoice, onCallVideo, onCancelCall, topOffset = 0,
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
        position: 'fixed', top: 56 + topOffset, left: 12, width: 280,
        height: `calc(100vh - ${80 + topOffset}px)`, zIndex: 50,
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

    const miniBtn: React.CSSProperties = {
        width: 26, height: 26, borderRadius: 7, border: '1px solid #e5e7eb',
        background: '#f9fafb', color: '#374151', fontSize: 13, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        padding: 0,
    };

    // Peers in range who haven't been knocked yet (not in pendingKnocks, not already connected)
    const callablePeers = nearbyPeers.filter(p => !pendingKnockPeerIds.has(p.userId));
    const pendingPeers = nearbyPeers.filter(p => pendingKnockPeerIds.has(p.userId));
    const solo = nearbyPeers.length === 1 ? nearbyPeers[0] : null;

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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15 }}>💬</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111', flex: 1 }}>Nearby Chat</span>

                    {roomId && members.length === 1 && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#ede9fe', color: '#6d28d9', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>Private</span>
                    )}
                    {roomId && members.length >= 2 && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#e0f2fe', color: '#0369a1', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>Group · {members.length + 1}</span>
                    )}

                    {/* ── 1-on-1 call buttons ── */}
                    {solo && !pendingKnockPeerIds.has(solo.userId) && (
                        <>
                            <button
                                onClick={() => onCallVoice(solo.userId)}
                                title={`Voice call ${solo.username}`}
                                style={miniBtn}
                            >🎙️</button>
                            <button
                                onClick={() => onCallVideo(solo.userId)}
                                title={`Video call ${solo.username}`}
                                style={miniBtn}
                            >📹</button>
                        </>
                    )}
                    {solo && pendingKnockPeerIds.has(solo.userId) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <span style={{ fontSize: 10, color: '#6d28d9', fontWeight: 600, whiteSpace: 'nowrap' }}>Calling…</span>
                            <button
                                onClick={() => onCancelCall(solo.userId)}
                                title="Cancel call"
                                style={{ ...miniBtn, color: '#ef4444', borderColor: '#fca5a5' }}
                            >✕</button>
                        </div>
                    )}

                    {/* ── Group call button (2+ nearby peers) ── */}
                    {nearbyPeers.length > 1 && (
                        pendingPeers.length === nearbyPeers.length ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <span style={{ fontSize: 10, color: '#6d28d9', fontWeight: 600, whiteSpace: 'nowrap' }}>Calling…</span>
                                {pendingPeers.map(p => (
                                    <button
                                        key={p.userId}
                                        onClick={() => onCancelCall(p.userId)}
                                        title={`Cancel call to ${p.username}`}
                                        style={{ ...miniBtn, color: '#ef4444', borderColor: '#fca5a5', fontSize: 10 }}
                                    >✕</button>
                                ))}
                            </div>
                        ) : (
                            <button
                                onClick={() => callablePeers.forEach(p => onCallVoice(p.userId))}
                                title="Call everyone nearby"
                                style={miniBtn}
                            >📞</button>
                        )
                    )}

                    <button
                        onClick={onClose}
                        style={{ ...miniBtn, marginLeft: 2 }}
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
