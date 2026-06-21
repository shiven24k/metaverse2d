import React, { useEffect, useRef, useState } from "react";
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

interface AvatarDef { id: string; imageUrl: string | null; name: string | null; }
interface Profile {
    id: string;
    username: string;
    displayUsername: string | null;
    avatar: AvatarDef | null;
    image: string | null;
    spaceCount: number;
    createdAt: string;
}

function Toast({ msg, isError, onDone }: { msg: string; isError: boolean; onDone: () => void }) {
    useEffect(() => {
        const t = setTimeout(onDone, 2500);
        return () => clearTimeout(t);
    }, [msg]);
    return (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: isError ? "#fef2f2" : "#f0fdf4", border: `1px solid ${isError ? "#fecaca" : "#bbf7d0"}`, borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, color: isError ? "#dc2626" : "#15a34a", zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", whiteSpace: "nowrap" }}>
            {msg}
        </div>
    );
}

export default function ProfilePage() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const token = useAuthStore((s) => s.token);
    const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [avatars, setAvatars] = useState<AvatarDef[]>([]);
    const [isOwnProfile, setIsOwnProfile] = useState(false);

    // Avatar character picker
    const [savingAvatar, setSavingAvatar] = useState(false);

    // Display name edit
    const [displayName, setDisplayName] = useState("");
    const [savingName, setSavingName] = useState(false);

    // Username edit
    const [usernameInput, setUsernameInput] = useState("");
    const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
    const [savingUsername, setSavingUsername] = useState(false);
    const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Profile photo upload
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Toast
    const [toast, setToast] = useState<{ msg: string; isError: boolean } | null>(null);

    const showToast = (msg: string, isError = false) => setToast({ msg, isError });

    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        Promise.all([
            fetch(`${API}/api/v1/player/${userId}`).then(r => r.ok ? r.json() : null),
            fetch(`${API}/api/v1/user/avatars`).then(r => r.ok ? r.json() : { avatars: [] }),
            fetch(`${API}/api/v1/user/me`, { headers: authHeaders }).then(r => r.ok ? r.json() : null),
        ]).then(([profileData, avatarsData, meData]) => {
            setProfile(profileData);
            setAvatars(avatarsData.avatars || []);
            const own = meData?.user?.id === userId;
            setIsOwnProfile(own);
            if (own && profileData) {
                setDisplayName(profileData.displayUsername || profileData.username || "");
                setUsernameInput(profileData.username || "");
            }
        }).finally(() => setLoading(false));
    }, [userId, token]);

    const handleSelectAvatar = async (avatarId: string) => {
        if (savingAvatar) return;
        setSavingAvatar(true);
        try {
            const res = await fetch(`${API}/api/v1/user/metadata`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ avatarId }),
            });
            if (res.ok) {
                setProfile(prev => prev ? { ...prev, avatar: avatars.find(a => a.id === avatarId) || prev.avatar } : prev);
                showToast("Character updated!");
            } else {
                const d = await res.json();
                showToast(d.message || "Failed to update", true);
            }
        } catch {
            showToast("Network error", true);
        } finally {
            setSavingAvatar(false);
        }
    };

    const handleSaveName = async () => {
        if (!displayName.trim()) return;
        setSavingName(true);
        try {
            const res = await fetch(`${API}/api/v1/user/metadata`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ displayUsername: displayName.trim() }),
            });
            if (res.ok) {
                setProfile(prev => prev ? { ...prev, displayUsername: displayName.trim() } : prev);
                showToast("Display name saved!");
            } else {
                const d = await res.json();
                showToast(d.message || "Failed to save", true);
            }
        } catch {
            showToast("Network error", true);
        } finally {
            setSavingName(false);
        }
    };

    const validateUsername = (v: string) => /^[a-zA-Z0-9_]{3,20}$/.test(v);

    const handleUsernameChange = (v: string) => {
        setUsernameInput(v);
        setUsernameStatus("idle");
        if (usernameTimer.current) clearTimeout(usernameTimer.current);
        if (!validateUsername(v)) {
            if (v.length >= 1) setUsernameStatus("invalid");
            return;
        }
        if (v === profile?.username) return;
        setUsernameStatus("checking");
        usernameTimer.current = setTimeout(async () => {
            try {
                const r = await fetch(`${API}/api/v1/user/check-username?username=${encodeURIComponent(v)}`);
                const d = await r.json();
                setUsernameStatus(d.available ? "available" : "taken");
            } catch {
                setUsernameStatus("idle");
            }
        }, 500);
    };

    const handleSaveUsername = async () => {
        if (!validateUsername(usernameInput) || usernameStatus === "taken" || usernameStatus === "checking") return;
        setSavingUsername(true);
        try {
            const res = await fetch(`${API}/api/v1/user/username`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ username: usernameInput }),
            });
            if (res.ok) {
                setProfile(prev => prev ? { ...prev, username: usernameInput } : prev);
                setUsernameStatus("idle");
                showToast("Username saved!");
            } else {
                const d = await res.json();
                showToast(d.message || "Failed to save", true);
            }
        } catch {
            showToast("Network error", true);
        } finally {
            setSavingUsername(false);
        }
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhotoFile(file);
        const reader = new FileReader();
        reader.onload = ev => setPhotoPreview(ev.target?.result as string);
        reader.readAsDataURL(file);
    };

    const handlePhotoUpload = async () => {
        if (!photoFile) return;
        setUploadingPhoto(true);
        try {
            const fd = new FormData();
            fd.append("file", photoFile);
            const res = await fetch(`${API}/api/v1/user/avatar`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
            });
            if (res.ok) {
                const d = await res.json();
                setProfile(prev => prev ? { ...prev, image: d.url } : prev);
                setPhotoFile(null);
                showToast("Profile photo updated!");
            } else {
                const d = await res.json();
                showToast(d.message || "Upload failed", true);
            }
        } catch {
            showToast("Network error", true);
        } finally {
            setUploadingPhoto(false);
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
                <div style={s.centeredFill}><p style={{ color: "#9592aa", fontSize: 14, fontWeight: 500 }}>Loading profile…</p></div>
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

    const shownName = profile.displayUsername || profile.username;
    const currentAvatarId = profile.avatar?.id;
    const role = currentAvatarId ? AVATAR_ROLE[currentAvatarId] : undefined;
    const profilePhoto = photoPreview || (profile.image ? `${API}${profile.image}` : null);

    const usernameHint =
        usernameStatus === "checking" ? "Checking…"
        : usernameStatus === "available" ? "✓ Available"
        : usernameStatus === "taken" ? "✗ Already taken"
        : usernameStatus === "invalid" ? "3–20 chars, letters/numbers/underscore only"
        : "";
    const usernameHintColor =
        usernameStatus === "available" ? "#15a34a"
        : usernameStatus === "taken" || usernameStatus === "invalid" ? "#dc2626"
        : "#9592aa";

    return (
        <div style={s.page}>
            <div style={s.topBar}>
                <button onClick={() => navigate(-1)} style={s.backBtn}>← Back</button>
            </div>

            <div style={s.content}>

                {/* ── Hero card ── */}
                <div style={s.card}>
                    <div style={s.heroCenter}>
                        {/* Avatar ring + photo */}
                        <div style={{ position: "relative" }}>
                            <div style={s.avatarRing}>
                                <div style={s.avatarInner}>
                                    {profilePhoto
                                        ? <img src={profilePhoto} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                        : <PixelAvatar avatarId={currentAvatarId} size={80} />
                                    }
                                </div>
                            </div>
                            {isOwnProfile && (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Change photo"
                                    style={{ position: "absolute", bottom: 0, right: -4, width: 28, height: 28, borderRadius: "50%", border: "2px solid #fff", background: "#7c3aed", color: "#fff", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                >
                                    ✎
                                </button>
                            )}
                            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoSelect} />
                        </div>

                        {/* Photo upload confirm */}
                        {photoFile && (
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <button onClick={handlePhotoUpload} disabled={uploadingPhoto}
                                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: uploadingPhoto ? 0.7 : 1 }}>
                                    {uploadingPhoto ? "Uploading…" : "Save photo"}
                                </button>
                                <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e3e1ee", background: "#fff", fontSize: 12, cursor: "pointer", color: "#6f6b82" }}>
                                    Cancel
                                </button>
                            </div>
                        )}

                        {role && <span style={s.rolePill}>{role}</span>}
                    </div>

                    <h1 style={s.displayName}>{shownName}</h1>
                    <p style={s.atUsername}>@{profile.username}</p>

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

                {/* ── Character picker ── */}
                {isOwnProfile && avatars.length > 0 && (
                    <div style={s.card}>
                        <div style={s.sectionHead}>
                            <span style={s.sectionLabel}>Your Character</span>
                        </div>
                        <div style={s.avatarGrid}>
                            {avatars.map(a => {
                                const selected = currentAvatarId === a.id;
                                const aRole = AVATAR_ROLE[a.id] ?? null;
                                return (
                                    <button key={a.id}
                                        onClick={() => !selected && handleSelectAvatar(a.id)}
                                        disabled={savingAvatar}
                                        style={{ ...s.avatarCard, border: selected ? "2.5px solid #7c3aed" : "2px solid #ecebf3", background: selected ? "#faf8ff" : "#fff", opacity: savingAvatar && !selected ? 0.5 : 1, cursor: selected || savingAvatar ? "default" : "pointer", boxShadow: selected ? "0 0 0 3px rgba(124,58,237,.14)" : "none" }}
                                    >
                                        {selected && <div style={s.checkBadge}>✓</div>}
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

                {/* ── Edit profile (own profile only) ── */}
                {isOwnProfile && (
                    <div style={s.card}>
                        <div style={s.sectionHead}>
                            <span style={s.sectionLabel}>Edit Profile</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                            {/* Display name */}
                            <div style={s.fieldWrap}>
                                <label style={s.fieldLabel}>Display Name</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input
                                        value={displayName}
                                        onChange={e => setDisplayName(e.target.value)}
                                        maxLength={50}
                                        style={{ ...s.fieldInput, flex: 1 }}
                                        placeholder="How your name appears"
                                    />
                                    <button onClick={handleSaveName} disabled={savingName || !displayName.trim()}
                                        style={{ padding: "0 18px", borderRadius: 10, border: "none", background: savingName ? "#c4b5fd" : "#7c3aed", color: "#fff", fontSize: 13, fontWeight: 700, cursor: savingName ? "default" : "pointer", flexShrink: 0 }}>
                                        {savingName ? "Saving…" : "Save"}
                                    </button>
                                </div>
                                <p style={s.fieldNote}>Shown throughout the app. Different from your login username.</p>
                            </div>

                            {/* Username */}
                            <div style={s.fieldWrap}>
                                <label style={s.fieldLabel}>Username</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input
                                        value={usernameInput}
                                        onChange={e => handleUsernameChange(e.target.value)}
                                        maxLength={20}
                                        style={{ ...s.fieldInput, flex: 1, borderColor: usernameStatus === "taken" || usernameStatus === "invalid" ? "#fca5a5" : usernameStatus === "available" ? "#86efac" : "#e3e1ee" }}
                                        placeholder="your_username"
                                    />
                                    <button
                                        onClick={handleSaveUsername}
                                        disabled={savingUsername || usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking" || usernameInput === profile.username}
                                        style={{ padding: "0 18px", borderRadius: 10, border: "none", background: savingUsername ? "#c4b5fd" : "#7c3aed", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: (usernameStatus === "taken" || usernameStatus === "invalid" || usernameInput === profile.username) ? 0.45 : 1 }}>
                                        {savingUsername ? "Saving…" : "Save"}
                                    </button>
                                </div>
                                {usernameHint && <p style={{ ...s.fieldNote, color: usernameHintColor, fontWeight: 600 }}>{usernameHint}</p>}
                                <p style={s.fieldNote}>3–20 characters, letters, numbers and underscores only.</p>
                            </div>

                        </div>
                    </div>
                )}

            </div>

            {toast && <Toast msg={toast.msg} isError={toast.isError} onDone={() => setToast(null)} />}
        </div>
    );
}

const s: Record<string, React.CSSProperties> = {
    page: { minHeight: "100vh", background: "#f8f7ff", fontFamily: "system-ui, -apple-system, sans-serif", color: "#191427" },
    centeredFill: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" },
    topBar: { padding: "14px 24px", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #ecebf3", position: "sticky", top: 0, zIndex: 10 },
    backBtn: { padding: "7px 16px", borderRadius: 9, border: "1.5px solid #e3e1ee", background: "#fff", color: "#4d495f", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    backBtnSolid: { padding: "10px 22px", borderRadius: 10, border: "1.5px solid #e3e1ee", background: "#fff", color: "#4d495f", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    content: { maxWidth: 680, margin: "0 auto", padding: "24px 20px 72px", display: "flex", flexDirection: "column", gap: 16 },
    card: { background: "#fff", borderRadius: 20, border: "1px solid #ecebf3", boxShadow: "0 2px 16px rgba(99,102,241,.07), 0 1px 3px rgba(22,15,52,0.04)", padding: "28px 24px" },
    heroCenter: { display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18, gap: 10 },
    avatarRing: { width: 108, height: 108, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 50%, #ec4899 100%)", padding: 3, display: "flex", alignItems: "center", justifyContent: "center" },
    avatarInner: { width: 102, height: 102, borderRadius: "50%", background: "#f4f0fe", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
    rolePill: { fontSize: 10, fontWeight: 800, color: "#5b21b6", background: "#f4f0fe", border: "1.5px solid #e7ddfb", borderRadius: 20, padding: "3px 14px", letterSpacing: "0.07em", textTransform: "uppercase" },
    displayName: { margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: "#191427", textAlign: "center", letterSpacing: "-0.02em" },
    atUsername: { margin: "0 0 22px", fontSize: 14, color: "#9592aa", textAlign: "center", fontWeight: 500 },
    statsRow: { display: "flex", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap" },
    statChip: { display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 18px", background: "#f4f0fe", borderRadius: 14, minWidth: 76, gap: 2 },
    statNum: { fontSize: 15, fontWeight: 800, color: "#6d28d9", lineHeight: "1.2" },
    statLabel: { fontSize: 9, fontWeight: 700, color: "#9592aa", textTransform: "uppercase", letterSpacing: "0.08em" },
    statDot: { width: 4, height: 4, borderRadius: "50%", background: "#d4d0e6" },
    sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
    sectionLabel: { fontSize: 10, fontWeight: 800, color: "#9592aa", textTransform: "uppercase", letterSpacing: "0.1em" },
    avatarGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
    avatarCard: { position: "relative", display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 8px 12px", borderRadius: 16, transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s", gap: 4, minWidth: 0, fontFamily: "inherit" },
    checkBadge: { position: "absolute", top: 7, right: 7, width: 18, height: 18, borderRadius: "50%", background: "#7c3aed", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" },
    avatarCardName: { margin: 0, fontSize: 12, fontWeight: 700, color: "#191427", textAlign: "center" },
    avatarCardRole: { fontSize: 9, fontWeight: 700, color: "#6d28d9", background: "#f4f0fe", borderRadius: 8, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.06em" },
    fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
    fieldLabel: { fontSize: 11, fontWeight: 700, color: "#7c6f9c", letterSpacing: "0.03em" },
    fieldInput: { padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e3e1ee", background: "#fff", fontSize: 14, color: "#191427", outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color 0.15s" },
    fieldNote: { margin: 0, fontSize: 11, color: "#b0adc4" },
};
