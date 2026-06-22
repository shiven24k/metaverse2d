interface VoiceToolbarProps {
    micEnabled: boolean;
    cameraEnabled: boolean;
    connectedPeers: number;
    onToggleMic: () => void;
    onToggleCamera: () => void;
}

export function VoiceToolbar({ micEnabled, cameraEnabled, connectedPeers, onToggleMic, onToggleCamera }: VoiceToolbarProps) {
    if (connectedPeers === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 74,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(15,10,30,0.92)',
            border: '1px solid rgba(124,58,237,0.4)',
            borderRadius: 14,
            padding: '8px 14px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
        }}>
            <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, marginRight: 4 }}>
                {connectedPeers} nearby
            </span>

            <button
                onClick={onToggleMic}
                title={micEnabled ? 'Mute mic' : 'Unmute mic'}
                style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: micEnabled ? 'rgba(124,58,237,0.25)' : 'rgba(239,68,68,0.25)',
                    border: `1px solid ${micEnabled ? 'rgba(124,58,237,0.5)' : 'rgba(239,68,68,0.5)'}`,
                    color: micEnabled ? '#a78bfa' : '#f87171',
                    cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                {micEnabled ? '🎙️' : '🔇'}
            </button>

            <button
                onClick={onToggleCamera}
                title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
                style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: cameraEnabled ? 'rgba(124,58,237,0.25)' : 'rgba(55,65,81,0.4)',
                    border: `1px solid ${cameraEnabled ? 'rgba(124,58,237,0.5)' : 'rgba(75,85,99,0.5)'}`,
                    color: cameraEnabled ? '#a78bfa' : '#9ca3af',
                    cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                {cameraEnabled ? '📹' : '📷'}
            </button>
        </div>
    );
}
