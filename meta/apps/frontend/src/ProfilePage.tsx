import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface Profile {
    id: string;
    username: string;
    displayUsername: string | null;
    avatar: { id: string; imageUrl: string | null; name: string | null } | null;
    spaceCount: number;
    createdAt: string;
}

export default function ProfilePage() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        fetch(`${API}/api/v1/player/${userId}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => setProfile(d))
            .finally(() => setLoading(false));
    }, [userId]);

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
};
