import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

const AVATAR_ROLE: Record<string, string> = {
    "avatar-ceo":       "CEO",
    "avatar-dev":       "Developer",
    "avatar-designer":  "Designer",
    "avatar-hr":        "HR",
    "avatar-marketing": "Marketing",
    "avatar-intern":    "Intern",
};

// Front-face idle frame: col 0, row 0 of the 256×96 sprite sheet (8×2 frames at 32×48 each)
function PixelAvatar({ avatarId, size = 48 }: { avatarId?: string; size?: number }) {
    const id = avatarId ?? "avatar-intern";
    const scale = size / 48;
    return (
        <div style={{ width: Math.round(32 * scale), height: size, position: "relative", flexShrink: 0, overflow: "hidden" }}>
            <img
                src={`/avatars/${id}.png`}
                alt={id}
                style={{
                    width: Math.round(256 * scale),
                    height: Math.round(96 * scale),
                    imageRendering: "pixelated",
                    position: "absolute",
                    top: 0,
                    left: 0,
                    display: "block",
                }}
            />
        </div>
    );
}

interface AvatarDef {
    id: string;
    imageUrl: string | null;
    name: string | null;
}

interface Profile {
    id: string;
    username: string;
    displayUsername: string | null;
    avatar: AvatarDef | null;
    spaceCount: number;
    createdAt: string;
}

export default function ProfilePage() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const token = useAuthStore((s) => s.token);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [avatars, setAvatars] = useState<AvatarDef[]>([]);
    const [isOwnProfile, setIsOwnProfile] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState("");
    const [saveMsgIsError, setSaveMsgIsError] = useState(false);

    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        Promise.all([
            fetch(`${API}/api/v1/player/${userId}`).then(r => r.ok ? r.json() : null),
            fetch(`${API}/api/v1/user/avatars`).then(r => r.ok ? r.json() : { avatars: [] }),
            fetch(`${API}/api/v1/user/me`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
        ]).then(([profileData, avatarsData, meData]) => {
            setProfile(profileData);
            setAvatars(avatarsData.avatars || []);
            setIsOwnProfile(meData?.user?.id === userId);
        }).finally(() => setLoading(false));
    }, [userId, token]);

    const handleSelectAvatar = async (avatarId: string) => {
        setSaving(true);
        setSaveMsg("");
        setSaveMsgIsError(false);
        try {
            const res = await fetch(`${API}/api/v1/user/metadata`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ avatarId }),
            });
            if (res.ok) {
                setSaveMsg("Character updated!");
                setProfile(prev => prev ? { ...prev, avatar: avatars.find(a => a.id === avatarId) || prev.avatar } : prev);
                setTimeout(() => setSaveMsg(""), 2500);
            } else {
                const d = await res.json();
                setSaveMsg(d.message || "Failed to update");
                setSaveMsgIsError(true);
            }
        } catch {
            setSaveMsg("Network error");
            setSaveMsgIsError(true);
        } finally {
            setSaving(false);
        }
    };

    const daysActive = profile
        ? Math.max(1, Math.floor((Date.now() - new Date(profile.createdAt).getTime()) / 86_400_000))
        : 0;

    const joinedLabel = profile
        ? new Date(profile.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : "";

    if (loading) {
        return (
            <div style={s.page}>
                <div style={s.centeredFill}>
                    <p style={{ color: "#9592aa", fontSize: 14, fontWeight: 500 }}>Loading profile…</p>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div style={s.page}>
                <div style={{ ...s.card, maxWidth: 480, margin: "80px auto", textAlign: "center", padding: "48px 32px" }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>👤</div>
                    <p style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "#191427" }}>User not found</p>
                    <button onClick={() => navigate(-1)} style={s.backBtnSolid}>← Go back</button>
                </div>
            </div>
        );
    }

    const displayName = profile.displayUsername || profile.username;
    const currentAvatarId = profile.avatar?.id;
    const role = currentAvatarId ? AVATAR_ROLE[currentAvatarId] : undefined;

    return (
        <div style={s.page}>
            {/* Sticky back bar */}
            <div style={s.topBar}>
                <button onClick={() => navigate(-1)} style={s.backBtn}>← Back</button>
            </div>

            <div style={s.content}>

                {/* ── Hero card ── */}
                <div style={s.card}>
                    {/* Avatar with gradient ring */}
                    <div style={s.heroCenter}>
                        <div style={s.avatarRing}>
                            <div style={s.avatarInner}>
                                <PixelAvatar avatarId={currentAvatarId} size={80} />
                            </div>
                        </div>
                        {role && <span style={s.rolePill}>{role}</span>}
                    </div>

                    <h1 style={s.displayName}>{displayName}</h1>
                    <p style={s.atUsername}>@{profile.username}</p>

                    {/* Stats row */}
                    <div style={s.statsRow}>
                        <div style={s.statChip}>
                            <span style={s.statNum}>{profile.spaceCount}</span>
                            <span style={s.statLabel}>Spaces</span>
                        </div>
                        <div style={s.statDot} />
                        <div style={s.statChip}>
                            <span style={s.statNum}>{joinedLabel}</span>
                            <span style={s.statLabel}>Joined</span>
                        </div>
                        <div style={s.statDot} />
                        <div style={s.statChip}>
                            <span style={s.statNum}>{daysActive}</span>
                            <span style={s.statLabel}>Days active</span>
                        </div>
                    </div>
                </div>

                {/* ── Character picker (own profile only) ── */}
                {isOwnProfile && avatars.length > 0 && (
                    <div style={s.card}>
                        <div style={s.sectionHead}>
                            <span style={s.sectionLabel}>Your Character</span>
                            {saveMsg && (
                                <span style={{ fontSize: 12, fontWeight: 700, color: saveMsgIsError ? "#dc2626" : "#15a34a" }}>
                                    {saveMsg}
                                </span>
                            )}
                        </div>

                        <div style={s.avatarGrid}>
                            {avatars.map(a => {
                                const selected = currentAvatarId === a.id;
                                const aRole = AVATAR_ROLE[a.id] ?? null;
                                return (
                                    <button
                                        key={a.id}
                                        onClick={() => !selected && !saving && handleSelectAvatar(a.id)}
                                        disabled={saving}
                                        style={{
                                            ...s.avatarCard,
                                            border: selected ? "2.5px solid #7c3aed" : "2px solid #ecebf3",
                                            background: selected ? "#faf8ff" : "#fff",
                                            opacity: saving && !selected ? 0.5 : 1,
                                            cursor: selected || saving ? "default" : "pointer",
                                            boxShadow: selected ? "0 0 0 3px rgba(124,58,237,.14)" : "none",
                                        }}
                                    >
                                        {selected && (
                                            <div style={s.checkBadge}>✓</div>
                                        )}
                                        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                                            <PixelAvatar avatarId={a.id} size={56} />
                                        </div>
                                        <p style={s.avatarCardName}>{a.name ?? aRole ?? a.id}</p>
                                        {aRole && <span style={s.avatarCardRole}>{aRole}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Profile info (own profile only) ── */}
                {isOwnProfile && (
                    <div style={s.card}>
                        <div style={s.sectionHead}>
                            <span style={s.sectionLabel}>Profile Info</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <div style={s.fieldWrap}>
                                <label style={s.fieldLabel}>Display Name</label>
                                <input
                                    readOnly
                                    defaultValue={displayName}
                                    style={s.fieldInput}
                                />
                                <p style={s.fieldNote}>Set automatically from your account.</p>
                            </div>
                            <div style={s.fieldWrap}>
                                <label style={s.fieldLabel}>Username</label>
                                <input
                                    readOnly
                                    defaultValue={profile.username}
                                    style={s.fieldInput}
                                />
                                <p style={s.fieldNote}>Username changes are managed from account settings.</p>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}

const s: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100vh",
        background: "#f8f7ff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#191427",
    },
    centeredFill: {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    topBar: {
        padding: "14px 24px",
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #ecebf3",
        position: "sticky",
        top: 0,
        zIndex: 10,
    },
    backBtn: {
        padding: "7px 16px",
        borderRadius: 9,
        border: "1.5px solid #e3e1ee",
        background: "#fff",
        color: "#4d495f",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "border-color 0.15s",
    },
    backBtnSolid: {
        padding: "10px 22px",
        borderRadius: 10,
        border: "1.5px solid #e3e1ee",
        background: "#fff",
        color: "#4d495f",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
    },
    content: {
        maxWidth: 680,
        margin: "0 auto",
        padding: "24px 20px 72px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
    },
    card: {
        background: "#fff",
        borderRadius: 20,
        border: "1px solid #ecebf3",
        boxShadow: "0 2px 16px rgba(99,102,241,.07), 0 1px 3px rgba(22,15,52,0.04)",
        padding: "28px 24px",
    },

    // Hero
    heroCenter: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginBottom: 18,
        gap: 10,
    },
    avatarRing: {
        width: 108,
        height: 108,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 50%, #ec4899 100%)",
        padding: 3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarInner: {
        width: 102,
        height: 102,
        borderRadius: "50%",
        background: "#f4f0fe",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    rolePill: {
        fontSize: 10,
        fontWeight: 800,
        color: "#5b21b6",
        background: "#f4f0fe",
        border: "1.5px solid #e7ddfb",
        borderRadius: 20,
        padding: "3px 14px",
        letterSpacing: "0.07em",
        textTransform: "uppercase",
    },
    displayName: {
        margin: "0 0 4px",
        fontSize: 24,
        fontWeight: 800,
        color: "#191427",
        textAlign: "center",
        letterSpacing: "-0.02em",
    },
    atUsername: {
        margin: "0 0 22px",
        fontSize: 14,
        color: "#9592aa",
        textAlign: "center",
        fontWeight: 500,
    },

    // Stats
    statsRow: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
    },
    statChip: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "10px 18px",
        background: "#f4f0fe",
        borderRadius: 14,
        minWidth: 76,
        gap: 2,
    },
    statNum: {
        fontSize: 15,
        fontWeight: 800,
        color: "#6d28d9",
        lineHeight: "1.2",
    },
    statLabel: {
        fontSize: 9,
        fontWeight: 700,
        color: "#9592aa",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
    },
    statDot: {
        width: 4,
        height: 4,
        borderRadius: "50%",
        background: "#d4d0e6",
    },

    // Sections
    sectionHead: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 18,
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: 800,
        color: "#9592aa",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
    },

    // Avatar grid
    avatarGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
    },
    avatarCard: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "14px 8px 12px",
        borderRadius: 16,
        transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
        gap: 4,
        minWidth: 0,
        fontFamily: "inherit",
    },
    checkBadge: {
        position: "absolute",
        top: 7,
        right: 7,
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: "#7c3aed",
        color: "#fff",
        fontSize: 10,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarCardName: {
        margin: 0,
        fontSize: 12,
        fontWeight: 700,
        color: "#191427",
        textAlign: "center",
    },
    avatarCardRole: {
        fontSize: 9,
        fontWeight: 700,
        color: "#6d28d9",
        background: "#f4f0fe",
        borderRadius: 8,
        padding: "2px 8px",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
    },

    // Profile info fields
    fieldWrap: {
        display: "flex",
        flexDirection: "column",
        gap: 5,
    },
    fieldLabel: {
        fontSize: 11,
        fontWeight: 700,
        color: "#7c6f9c",
        letterSpacing: "0.03em",
    },
    fieldInput: {
        padding: "10px 14px",
        borderRadius: 10,
        border: "1.5px solid #e3e1ee",
        background: "#faf8ff",
        fontSize: 14,
        color: "#6f6b82",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "inherit",
    },
    fieldNote: {
        margin: 0,
        fontSize: 11,
        color: "#b0adc4",
    },
};
