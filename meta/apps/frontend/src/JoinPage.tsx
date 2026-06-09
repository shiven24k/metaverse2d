import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface SpaceInfo {
    spaceId: string;
    spaceName: string;
    memberCount: number;
    dimensions: string;
}

export default function JoinPage() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const bearerToken = useAuthStore((s) => s.token);
    const isGuest = useAuthStore((s) => s.isGuest);

    const [info, setInfo] = useState<SpaceInfo | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);

    useEffect(() => {
        if (!token) return;
        fetch(`${API}/api/v1/invite/${token}`)
            .then(async (r) => {
                if (!r.ok) { const d = await r.json(); setError(d.message ?? "Invalid invite"); return; }
                setInfo(await r.json());
            })
            .catch(() => setError("Failed to load invite"))
            .finally(() => setLoading(false));
    }, [token]);

    const handleJoin = async () => {
        if (!bearerToken) {
            navigate(`/login?redirect=/join/${token}`);
            return;
        }
        setJoining(true);
        try {
            const r = await fetch(`${API}/api/v1/invite/${token}/join`, {
                method: "POST",
                headers: { Authorization: `Bearer ${bearerToken}`, "Content-Type": "application/json" },
            });
            if (!r.ok) { const d = await r.json(); setError(d.message ?? "Failed to join"); return; }
            const d = await r.json();
            navigate(`/arena?spaceId=${d.spaceId}`);
        } catch {
            setError("Failed to join");
        } finally {
            setJoining(false);
        }
    };

    return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6fb", fontFamily: "system-ui,-apple-system,sans-serif" }}>
            <div style={{ background: "#fff", border: "1px solid #ecebf3", borderRadius: 16, padding: "36px 40px", width: 380, boxShadow: "0 8px 32px rgba(99,102,241,.12)", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
                {loading ? (
                    <p style={{ color: "#6f6b82" }}>Loading invite…</p>
                ) : error ? (
                    <>
                        <p style={{ fontSize: 18, fontWeight: 700, color: "#191427", margin: "0 0 8px" }}>Invalid Invite</p>
                        <p style={{ fontSize: 14, color: "#6f6b82", margin: "0 0 24px" }}>{error}</p>
                        <button onClick={() => navigate("/lobby")} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                            Go to Lobby
                        </button>
                    </>
                ) : info ? (
                    <>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#6d28d9", letterSpacing: ".1em", textTransform: "uppercase", margin: "0 0 8px" }}>Private Space</p>
                        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#191427", margin: "0 0 8px", letterSpacing: "-0.02em" }}>{info.spaceName}</h1>
                        <p style={{ fontSize: 13, color: "#6f6b82", margin: "0 0 4px" }}>{info.dimensions} · {info.memberCount} member{info.memberCount !== 1 ? "s" : ""}</p>
                        <p style={{ fontSize: 13, color: "#6f6b82", margin: "0 0 28px" }}>You've been invited to join this private space.</p>
                        {(isGuest || !bearerToken) ? (
                            <>
                                <p style={{ fontSize: 13, color: "#b25e09", background: "#fef3c7", padding: "8px 12px", borderRadius: 8, marginBottom: 16 }}>
                                    Sign in to join private spaces.
                                </p>
                                <button onClick={() => navigate(`/login?redirect=/join/${token}`)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 16px rgba(124,58,237,.3)" }}>
                                    Sign In to Join
                                </button>
                            </>
                        ) : (
                            <button onClick={handleJoin} disabled={joining} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 16px rgba(124,58,237,.3)", opacity: joining ? 0.7 : 1 }}>
                                {joining ? "Joining…" : "Join Space →"}
                            </button>
                        )}
                    </>
                ) : null}
            </div>
        </div>
    );
}
