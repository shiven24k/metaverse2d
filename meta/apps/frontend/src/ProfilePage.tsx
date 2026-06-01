import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface Avatar {
    id: string;
    imageUrl: string | null;
    name: string | null;
}

interface Profile {
    id: string;
    username: string;
    displayUsername: string | null;
    avatar: Avatar | null;
    spaceCount: number;
    createdAt: string;
}

export default function ProfilePage() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const token = useAuthStore((s) => s.token);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [avatars, setAvatars] = useState<Avatar[]>([]);
    const [isOwnProfile, setIsOwnProfile] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState("");

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
        try {
            const res = await fetch(`${API}/api/v1/user/metadata`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ avatarId }),
            });
            if (res.ok) {
                setSaveMsg("Avatar updated!");
                setProfile(prev => prev ? { ...prev, avatar: avatars.find(a => a.id === avatarId) || prev.avatar } : prev);
            } else {
                const d = await res.json();
                setSaveMsg(d.message || "Failed to update");
            }
        } catch {
            setSaveMsg("Network error");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={styles.container}><p style={{ padding: 32, textAlign: "center", color: "#888" }}>Loading...</p></div>;
    if (!profile) return <div style={styles.container}><p style={{ padding: 32, textAlign: "center", color: "#888" }}>User not found</p></div>;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <button onClick={() => navigate(-1)} style={styles.backBtn}>← Back</button>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>Profile</h1>
            </div>
            <div style={styles.card}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <div style={{
                        width: 72, height: 72, borderRadius: "50%", background: "#e5e7eb",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 28, color: "#999",
                    }}>
                        {profile.avatar?.imageUrl ? <img src={profile.avatar.imageUrl} style={{ width: 72, height: 72, borderRadius: "50%" }} /> : "👤"}
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 20 }}>{profile.username}</h2>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>
                            {profile.spaceCount} space{profile.spaceCount !== 1 ? "s" : ""}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#aaa" }}>
                            Joined {new Date(profile.createdAt).toLocaleDateString()}
                        </p>
                    </div>
                </div>
            </div>
            {isOwnProfile && avatars.length > 0 && (
                <div style={styles.card}>
                    <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>Choose Avatar</h3>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {avatars.map(a => {
                            const selected = profile.avatar?.id === a.id;
                            return (
                                <button key={a.id} onClick={() => handleSelectAvatar(a.id)} disabled={saving || selected} style={{
                                    ...styles.avatarBtn,
                                    outline: selected ? "3px solid #6366f1" : "3px solid transparent",
                                    opacity: saving ? 0.6 : 1,
                                }}>
                                    <img src={a.imageUrl || ""} alt={a.name || "Avatar"} style={{ width: 56, height: 56, borderRadius: "50%" }} />
                                    <span style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{a.name}</span>
                                </button>
                            );
                        })}
                    </div>
                    {saveMsg && <p style={{ margin: "12px 0 0", fontSize: 13, color: "#059669" }}>{saveMsg}</p>}
                </div>
            )}
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: "100vh", background: "#f0f2f5", fontFamily: "system-ui, sans-serif",
    },
    header: {
        background: "#fff", padding: "16px 32px", display: "flex", alignItems: "center", gap: 16,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    },
    backBtn: {
        padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db",
        background: "#fff", cursor: "pointer", fontSize: 13,
    },
    card: {
        maxWidth: 500, margin: "32px auto", padding: "28px 32px",
        background: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
    },
    avatarBtn: {
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        padding: 8, border: "none", borderRadius: 10, background: "#f3f4f6",
        cursor: "pointer", transition: "all 0.15s",
    },
};
