import { useRef, useEffect } from 'react';

export interface ConferenceParticipant {
    peerId: string;
    stream?: MediaStream;
    username: string;
    isSelf: boolean;
    speaking: boolean;
    micEnabled: boolean;
    cameraEnabled: boolean;
    connectionState?: RTCPeerConnectionState;
}

interface Props {
    participants: ConferenceParticipant[];
    micEnabled: boolean;
    cameraEnabled: boolean;
    deafened: boolean;
    onToggleMic: () => void;
    onToggleCamera: () => void;
    onToggleDeafen: () => void;
    onLeaveCall: () => void;
}

function gridCols(count: number): string {
    if (count <= 1) return 'minmax(0,1fr)';
    if (count <= 2) return 'repeat(2, minmax(0,1fr))';
    if (count <= 4) return 'repeat(2, minmax(0,1fr))';
    return 'repeat(3, minmax(0,1fr))';
}

function MeetingTile({ p }: { p: ConferenceParticipant }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hasVideo = p.isSelf ? p.cameraEnabled : !!(p.stream?.getVideoTracks()[0]);

    useEffect(() => {
        const el = videoRef.current;
        if (!el || !p.stream) return;
        const vt = p.stream.getVideoTracks()[0];
        const attach = () => {
            el.srcObject = p.stream!;
            el.play().catch(() => {});
        };
        if (vt?.readyState === 'live') attach();
        else if (vt) vt.addEventListener('unmute', attach, { once: true });
        else attach();
        return () => { el.srcObject = null; };
    }, [p.stream]);

    const initials = (p.username || '?').slice(0, 2).toUpperCase();

    return (
        <div style={{
            position: 'relative',
            borderRadius: 12,
            overflow: 'hidden',
            background: '#1a1a2e',
            border: `3px solid ${p.speaking ? '#22c55e' : 'transparent'}`,
            transition: 'border-color 0.12s',
            aspectRatio: '16 / 9',
            minHeight: 80,
        }}>
            {hasVideo ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={p.isSelf}
                    style={{
                        width: '100%', height: '100%',
                        objectFit: 'cover', display: 'block',
                        transform: p.isSelf ? 'scaleX(-1)' : 'none',
                    }}
                />
            ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                        width: 60, height: 60, borderRadius: '50%',
                        background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22, fontWeight: 700, color: '#fff',
                        boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
                    }}>
                        {initials}
                    </div>
                </div>
            )}

            {/* Speaking indicator dot */}
            {p.speaking && (
                <div style={{
                    position: 'absolute', top: 8, right: 8,
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#22c55e',
                    boxShadow: '0 0 8px #22c55e',
                }} />
            )}

            {/* Connecting overlay for remote peers */}
            {!p.isSelf && p.connectionState && p.connectionState !== 'connected' && (
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.55)',
                }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                        {p.connectionState === 'failed' ? '✗ Failed'
                            : p.connectionState === 'disconnected' ? 'Disconnected'
                            : 'Connecting…'}
                    </span>
                </div>
            )}

            {/* Name + mute row */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.72))',
                padding: '20px 10px 8px',
                display: 'flex', alignItems: 'center', gap: 5,
            }}>
                <span style={{
                    flex: 1, fontSize: 13, fontWeight: 600, color: '#fff',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {p.isSelf ? `${p.username} (You)` : p.username}
                </span>
                {!p.micEnabled && <span style={{ fontSize: 13, flexShrink: 0 }}>🔇</span>}
            </div>
        </div>
    );
}

function TbBtn({ onClick, title, active, icon, danger = false }: {
    onClick: () => void;
    title: string;
    active: boolean;
    icon: string;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            style={{
                width: 44, height: 44, borderRadius: 12, cursor: 'pointer', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: danger ? 'rgba(239,68,68,0.25)' : active ? 'rgba(124,58,237,0.25)' : 'rgba(55,65,81,0.4)',
                border: `1px solid ${danger ? 'rgba(239,68,68,0.5)' : active ? 'rgba(124,58,237,0.5)' : 'rgba(75,85,99,0.5)'}`,
                color: danger ? '#f87171' : active ? '#a78bfa' : '#9ca3af',
            }}
        >
            {icon}
        </button>
    );
}

export function ConferenceMeetingGrid({
    participants,
    micEnabled, cameraEnabled, deafened,
    onToggleMic, onToggleCamera, onToggleDeafen, onLeaveCall,
}: Props) {
    const count = participants.length;
    const cols = gridCols(count);
    const needsScroll = count > 9;

    return (
        <div style={{
            position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
            zIndex: 500, background: '#0d0d14',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'system-ui,-apple-system,sans-serif',
        }}>
            {/* Participant grid */}
            <div style={{
                flex: 1,
                overflowY: needsScroll ? 'auto' : 'hidden',
                padding: 12,
                display: 'grid',
                gridTemplateColumns: cols,
                gap: 8,
                alignContent: count <= 4 ? 'center' : 'start',
            }}>
                {participants.map(p => (
                    <MeetingTile key={p.peerId} p={p} />
                ))}
            </div>

            {/* Docked toolbar */}
            <div style={{
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 24px 20px',
                background: 'rgba(0,0,0,0.45)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
                <span style={{
                    fontSize: 12, color: '#a78bfa', fontWeight: 700,
                    marginRight: 6, whiteSpace: 'nowrap',
                }}>
                    {Math.max(0, count - 1)} in call
                </span>
                <TbBtn onClick={onToggleMic} title={micEnabled ? 'Mute mic' : 'Unmute mic'} active={micEnabled} icon={micEnabled ? '🎙️' : '🔇'} danger={!micEnabled} />
                <TbBtn onClick={onToggleDeafen} title={deafened ? 'Undeafen' : 'Deafen'} active={!deafened} icon={deafened ? '🔕' : '🎧'} danger={deafened} />
                <TbBtn onClick={onToggleCamera} title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'} active={cameraEnabled} icon={cameraEnabled ? '📹' : '📷'} />
                <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
                <button
                    onClick={onLeaveCall}
                    title="Leave call"
                    style={{
                        width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 18,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(220,38,38,0.85)',
                        border: '1px solid rgba(239,68,68,0.7)',
                        color: '#fff',
                    }}
                >📵</button>
            </div>
        </div>
    );
}
