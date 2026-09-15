import { useEffect, useMemo, useRef, useState } from 'react';

export interface MeetingParticipant {
    peerId: string;
    username: string;
    stream?: MediaStream;
    isSelf: boolean;
    sharing: boolean;
    cameraOn: boolean;
    micOn: boolean;
    speaking: boolean;
    connectionState?: RTCPeerConnectionState;
}

interface Props {
    participants: MeetingParticipant[];
    initialFocusPeerId?: string | null;
    micEnabled: boolean;
    cameraEnabled: boolean;
    deafened: boolean;
    screenSharing: boolean;
    canScreenShare: boolean;
    onToggleMic: () => void;
    onToggleCamera: () => void;
    onToggleDeafen: () => void;
    onToggleScreenShare: () => void;
    onClose: () => void;
}

/**
 * Google-Meet/Discord-style meeting popup: a large stage for the focused
 * participant (auto-picks the screen sharer / active speaker), a strip of
 * face tiles for everyone, and a full meeting control bar. Opens from the ⛶
 * button on any video tile (proximity calls) or the conference grid.
 */
function useAttachVideo(stream?: MediaStream) {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el || !stream) return;
        const vt = stream.getVideoTracks()[0];
        const attach = () => {
            el.srcObject = stream;
            el.play().catch(err => console.warn('[MeetingRoom] play failed:', err));
        };
        if (vt?.readyState === 'live') attach();
        else if (vt) vt.addEventListener('unmute', attach, { once: true });
        else attach();
        return () => { el.srcObject = null; };
    }, [stream]);
    return ref;
}

function AvatarFallback({ name, size }: { name: string; size: number }) {
    return (
        <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                width: size, height: size, borderRadius: '50%',
                background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: size * 0.38, fontWeight: 700, color: '#fff',
                boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
            }}>
                {(name || '?').slice(0, 2).toUpperCase()}
            </div>
        </div>
    );
}

function StageVideo({ p }: { p: MeetingParticipant }) {
    const videoRef = useAttachVideo(p.stream);
    const hasVideo = p.isSelf ? p.cameraOn : !!p.stream?.getVideoTracks()[0];
    return (
        <div style={{
            position: 'relative', flex: 1, borderRadius: 16, overflow: 'hidden',
            background: '#111', border: `3px solid ${p.speaking ? '#22c55e' : 'rgba(124,58,237,0.45)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 0,
        }}>
            {hasVideo && p.stream ? (
                <video ref={videoRef} autoPlay playsInline muted={p.isSelf}
                    style={{
                        width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                        transform: p.isSelf && !p.sharing ? 'scaleX(-1)' : 'none',
                    }} />
            ) : (
                <AvatarFallback name={p.username} size={140} />
            )}
            {p.sharing && (
                <div style={{
                    position: 'absolute', top: 12, left: 12, zIndex: 2,
                    background: 'rgba(124,58,237,0.95)', color: '#fff',
                    fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                    letterSpacing: 0.4, boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                }}>🖥 {p.isSelf ? 'You are presenting' : `${p.username}'s screen`}</div>
            )}
            {!p.micOn && !p.isSelf && (
                <div style={{
                    position: 'absolute', bottom: 12, right: 12, zIndex: 2,
                    width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}>🔇</div>
            )}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
                padding: '34px 16px 12px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                    {p.isSelf ? `${p.username} (You)` : p.username}
                </span>
                {p.speaking && <span style={{ fontSize: 13, color: '#22c55e' }}>● speaking</span>}
            </div>
        </div>
    );
}

function StripTile({ p, active, onClick }: { p: MeetingParticipant; active: boolean; onClick: () => void }) {
    const videoRef = useAttachVideo(p.stream);
    const hasVideo = p.isSelf ? p.cameraOn : !!p.stream?.getVideoTracks()[0];
    return (
        <button onClick={onClick} title={p.isSelf ? `${p.username} (You)` : p.username}
            style={{
                width: 160, height: 90, flexShrink: 0, borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                position: 'relative', border: `3px solid ${active ? '#a78bfa' : 'rgba(255,255,255,0.15)'}`,
                background: '#1a1a2e', padding: 0,
                transition: 'border-color 0.15s',
            }}>
            {hasVideo && p.stream ? (
                <video ref={videoRef} autoPlay playsInline muted
                    style={{
                        width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                        transform: p.isSelf && !p.sharing ? 'scaleX(-1)' : 'none',
                    }} />
            ) : (
                <AvatarFallback name={p.username} size={44} />
            )}
            {p.sharing && (
                <span style={{
                    position: 'absolute', top: 4, left: 4, zIndex: 2,
                    background: 'rgba(124,58,237,0.95)', color: '#fff', fontSize: 8, fontWeight: 700,
                    padding: '2px 5px', borderRadius: 5,
                }}>🖥 SCREEN</span>
            )}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2,
                background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 9, fontWeight: 600,
                padding: '2px 5px', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
                {p.isSelf ? `${p.username} (You)` : p.username} {!p.micOn ? '🔇' : ''} {p.speaking ? '●' : ''}
            </div>
        </button>
    );
}

function CtrlBtn({ onClick, title, active, icon, danger = false, disabled = false }: {
    onClick: () => void;
    title: string;
    active: boolean;
    icon: string;
    danger?: boolean;
    disabled?: boolean;
}) {
    return (
        <button onClick={onClick} title={title} disabled={disabled}
            style={{
                width: 46, height: 46, borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: danger ? 'rgba(239,68,68,0.3)' : active ? 'rgba(124,58,237,0.3)' : 'rgba(55,65,81,0.45)',
                border: `1px solid ${danger ? 'rgba(239,68,68,0.6)' : active ? 'rgba(124,58,237,0.6)' : 'rgba(75,85,99,0.6)'}`,
                color: danger ? '#f87171' : active ? '#c4b5fd' : '#d1d5db',
                opacity: disabled ? 0.5 : 1,
            }}>
            {icon}
        </button>
    );
}

export function MeetingRoomOverlay({
    participants, initialFocusPeerId, micEnabled, cameraEnabled, deafened,
    screenSharing, canScreenShare,
    onToggleMic, onToggleCamera, onToggleDeafen, onToggleScreenShare, onClose,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [focusPeerId, setFocusPeerId] = useState<string | null>(initialFocusPeerId ?? null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Auto-pick the screen sharer over everything else; otherwise follow the
    // active speaker when nothing is pinned. Keyed on primitives so the two
    // effects don't fight the linter and can't loop.
    const sharerPeerId = participants.find(p => p.sharing)?.peerId ?? null;
    const speakerPeerId = participants.find(p => p.speaking && !p.isSelf)?.peerId ?? null;
    useEffect(() => {
        const pinned = sharerPeerId
            ?? (focusPeerId && participants.some(p => p.peerId === focusPeerId) ? focusPeerId : null)
            ?? speakerPeerId
            ?? null;
        if (pinned && pinned !== focusPeerId) setFocusPeerId(pinned);
    }, [sharerPeerId, speakerPeerId, focusPeerId, participants]);

    const focused = sharerPeerId
        ? (participants.find(p => p.peerId === sharerPeerId) ?? participants[0])
        : (focusPeerId ? participants.find(p => p.peerId === focusPeerId) : undefined)
            ?? participants.find(p => p.peerId === speakerPeerId)
            ?? participants.find(p => !p.isSelf)
            ?? participants[0];

    const others = useMemo(() => participants.filter(p => !p.isSelf), [participants]);
    const count = participants.length;

    const toggleFullscreen = () => {
        const el = containerRef.current;
        if (!el) return;
        if (document.fullscreenElement) {
            void document.exitFullscreen();
            setIsFullscreen(false);
        } else {
            el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        }
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (document.fullscreenElement) {
                    void document.exitFullscreen();
                    setIsFullscreen(false);
                } else {
                    onClose();
                }
            }
        };
        const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        window.addEventListener('keydown', onKey);
        document.addEventListener('fullscreenchange', onFsChange);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.removeEventListener('fullscreenchange', onFsChange);
        };
    }, [onClose]);

    if (!focused) return null;

    return (
        <div ref={containerRef} style={{
            position: 'fixed', inset: 0, zIndex: 6000,
            background: '#0d0d14', color: '#fff',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'system-ui,-apple-system,sans-serif',
        }}>
            {/* Top bar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', background: 'rgba(0,0,0,0.35)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#a78bfa' }}>🎥 Meeting</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{Math.max(0, count - 1)} in call</span>
                {screenSharing && <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 700 }}>● You are presenting</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <CtrlBtn onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} active={isFullscreen} icon={isFullscreen ? '🗗' : '⛶'} />
                    <button onClick={onClose} title="Close meeting view (Esc)"
                        style={{
                            width: 46, height: 46, borderRadius: 12, cursor: 'pointer', fontSize: 16,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171',
                        }}>✕</button>
                </div>
            </div>

            {/* Stage + side strip */}
            <div style={{ flex: 1, display: 'flex', gap: 12, padding: 12, minHeight: 0 }}>
                <StageVideo p={focused} />
                {others.length > 0 && (
                    <div style={{
                        display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto',
                        width: 168, flexShrink: 0, paddingRight: 2,
                    }}>
                        {others.map(p => (
                            <StripTile key={p.peerId} p={p} active={focused.peerId === p.peerId}
                                onClick={() => setFocusPeerId(p.peerId)} />
                        ))}
                    </div>
                )}
            </div>

            {/* Control bar */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 24px 18px', background: 'rgba(0,0,0,0.45)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
                <CtrlBtn onClick={onToggleMic} title={micEnabled ? 'Mute mic' : 'Unmute mic'} active={micEnabled} icon={micEnabled ? '🎙️' : '🔇'} danger={!micEnabled} />
                <CtrlBtn onClick={onToggleDeafen} title={deafened ? 'Undeafen' : 'Deafen'} active={!deafened} icon={deafened ? '🔕' : '🎧'} danger={deafened} />
                <CtrlBtn onClick={onToggleCamera} title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'} active={cameraEnabled} icon={cameraEnabled ? '📹' : '📷'} />
                {canScreenShare && (
                    <CtrlBtn onClick={onToggleScreenShare} title={screenSharing ? 'Stop sharing screen' : 'Share your screen'} active={screenSharing} icon="🖥️" />
                )}
                <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
                <button onClick={onClose} title="Close meeting view"
                    style={{
                        width: 46, height: 46, borderRadius: 12, cursor: 'pointer', fontSize: 16,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(220,38,38,0.85)', border: '1px solid rgba(239,68,68,0.7)', color: '#fff',
                    }}>📵</button>
            </div>
        </div>
    );
}