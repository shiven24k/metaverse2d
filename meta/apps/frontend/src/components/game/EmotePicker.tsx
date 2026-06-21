import { EMOTE_CROP, EMOTE_FRAMES, EMOTES } from '../../constants/emotes';

interface EmotePickerProps {
    avatarId: string;
    activeEmote: string | null;
    onEmote: (emoteId: string) => void;
    onClose: () => void;
}

function emotePreviewDiv(emoteId: string, avatarFolder: string, displayH = 40) {
    const [cx, cy, cw, ch] = EMOTE_CROP[emoteId] ?? [21, 14, 22, 46];
    const scale = displayH / ch;
    const displayW = Math.round(cw * scale);
    const fullSheetW = (EMOTE_FRAMES[emoteId] ?? 1) * 64;
    return (
        <div style={{
            width: displayW,
            height: displayH,
            backgroundImage: `url(/emotes/${avatarFolder}/${emoteId}.png)`,
            backgroundPosition: `-${Math.round(cx * scale)}px -${Math.round(cy * scale)}px`,
            backgroundSize: `${Math.round(fullSheetW * scale)}px ${Math.round(64 * scale)}px`,
            imageRendering: 'pixelated',
            flexShrink: 0,
        }} />
    );
}

export function EmotePicker({ avatarId, activeEmote, onEmote, onClose }: EmotePickerProps) {
    const aFolder = avatarId.replace('avatar-', '');

    return (
        <div
            style={{
                position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%',
                transform: 'translateX(-50%)', display: 'flex', gap: 8,
                padding: '12px 16px', borderRadius: 16, background: '#fff',
                border: '1px solid #ecebf3', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                zIndex: 100, alignItems: 'center', whiteSpace: 'nowrap',
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {EMOTES.map((em) => {
                const isActive = activeEmote === em.id;
                return (
                    <button
                        key={em.id}
                        onClick={() => { onEmote(em.id); onClose(); }}
                        style={{
                            width: 48, height: 62, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 2,
                            borderRadius: 10,
                            border: isActive ? '2px solid #7c3aed' : '1px solid #ecebf3',
                            background: isActive ? '#f4f0fe' : '#f9f8fc',
                            cursor: 'pointer', padding: 0,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                        <div style={{ width: 48, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {emotePreviewDiv(em.id, aFolder)}
                        </div>
                        <span style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{em.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
