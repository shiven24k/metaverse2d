interface VoiceToolbarProps {
    micEnabled: boolean;
    cameraEnabled: boolean;
    deafened: boolean;
    connectedPeers: number;
    onToggleMic: () => void;
    onToggleCamera: () => void;
    onToggleDeafen: () => void;
    onLeaveCall: () => void;
}

export function VoiceToolbar({
    micEnabled, cameraEnabled, deafened, connectedPeers,
    onToggleMic, onToggleCamera, onToggleDeafen, onLeaveCall,
}: VoiceToolbarProps) {
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
            gap: 6,
            background: 'rgba(15,10,30,0.95)',
            border: '1px solid rgba(124,58,237,0.4)',
            borderRadius: 999,
            padding: '8px 16px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
        }}>
            <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}>
                {connectedPeers} nearby
            </span>

            <ToolbarBtn
                onClick={onToggleMic}
                title={micEnabled ? 'Mute mic' : 'Unmute mic'}
                active={micEnabled}
                icon={micEnabled ? '🎙️' : '🔇'}
                danger={!micEnabled}
            />

            <ToolbarBtn
                onClick={onToggleDeafen}
                title={deafened ? 'Undeafen' : 'Deafen'}
                active={!deafened}
                icon={deafened ? '🔕' : '🎧'}
                danger={deafened}
            />

            <ToolbarBtn
                onClick={onToggleCamera}
                title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
                active={cameraEnabled}
                icon={cameraEnabled ? '📹' : '📷'}
            />

            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

            <button
                onClick={onLeaveCall}
                title="Leave call"
                style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(220,38,38,0.85)',
                    border: '1px solid rgba(239,68,68,0.7)',
                    color: '#fff',
                    cursor: 'pointer', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                📵
            </button>
        </div>
    );
}

function ToolbarBtn({ onClick, title, active, icon, danger = false }: {
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
                width: 36, height: 36, borderRadius: 10,
                background: danger
                    ? 'rgba(239,68,68,0.25)'
                    : active ? 'rgba(124,58,237,0.25)' : 'rgba(55,65,81,0.4)',
                border: `1px solid ${danger
                    ? 'rgba(239,68,68,0.5)'
                    : active ? 'rgba(124,58,237,0.5)' : 'rgba(75,85,99,0.5)'}`,
                color: danger ? '#f87171' : active ? '#a78bfa' : '#9ca3af',
                cursor: 'pointer', fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
        >
            {icon}
        </button>
    );
}
