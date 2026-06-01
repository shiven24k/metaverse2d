import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function AuthPage() {
    const navigate = useNavigate();
    const setAuth = useAuthStore((s) => s.setAuth);
    const setGuest = useAuthStore((s) => s.setGuest);
    const [mode, setMode] = useState<"signin" | "signup">("signin");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            if (mode === "signup") {
                const signUpRes = await fetch(`${API}/api/auth/sign-up/email`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password, name: username, username }),
                });
                const signUpData = await signUpRes.json();
                if (!signUpRes.ok) {
                    setError(signUpData.message ?? "Sign up failed");
                    return;
                }
                const signInRes = await fetch(`${API}/api/auth/sign-in/email`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });
                if (!signInRes.ok) {
                    setError("Sign up succeeded but sign in failed. Please sign in manually.");
                    setMode("signin");
                    return;
                }
                const token = signInRes.headers.get("set-auth-token") ?? "";
                setAuth(token);
                navigate("/lobby", { replace: true });
            } else {
                const res = await fetch(`${API}/api/auth/sign-in/email`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });
                const data = await res.json();
                if (!res.ok) {
                    setError(data.message ?? "Sign in failed");
                    return;
                }
                const token = res.headers.get("set-auth-token") ?? "";
                setAuth(token);
                navigate("/lobby", { replace: true });
            }
        } catch (err: any) {
            setError(err.message ?? "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={S.page}>
            {/* Decorative blurred orbs */}
            <div style={S.orb1} />
            <div style={S.orb2} />

            <div style={S.card}>
                {/* Logo */}
                <div style={S.logoRow}>
                    <span style={S.logoPx}>M2D</span>
                    <span style={S.logoText}>Metaverse 2D</span>
                </div>
                <p style={S.tagline}>Explore. Build. Connect.</p>

                {/* Mode toggle */}
                <div style={S.tabs}>
                    <button
                        style={{ ...S.tab, ...(mode === "signin" ? S.tabActive : {}) }}
                        onClick={() => { setMode("signin"); setError(""); }}
                    >
                        Sign In
                    </button>
                    <button
                        style={{ ...S.tab, ...(mode === "signup" ? S.tabActive : {}) }}
                        onClick={() => { setMode("signup"); setError(""); }}
                    >
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={S.form}>
                    {mode === "signup" && (
                        <div style={S.field}>
                            <label style={S.label}>Username</label>
                            <input
                                style={S.input}
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="your_username"
                                required
                                autoComplete="username"
                            />
                        </div>
                    )}

                    <div style={S.field}>
                        <label style={S.label}>Email</label>
                        <input
                            style={S.input}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div style={S.field}>
                        <label style={S.label}>Password</label>
                        <input
                            style={S.input}
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        />
                    </div>

                    {error && <p style={S.error}>{error}</p>}

                    <button style={S.submitBtn} type="submit" disabled={loading}>
                        {loading ? "Loading…" : mode === "signin" ? "Sign In" : "Create Account"}
                    </button>
                </form>

                <div style={S.divider}>
                    <span style={S.dividerLine} />
                    <span style={S.dividerText}>or</span>
                    <span style={S.dividerLine} />
                </div>

                <button
                    style={S.guestBtn}
                    onClick={() => { setGuest(); navigate("/lobby", { replace: true }); }}
                >
                    Browse as Guest
                </button>
                <p style={S.guestNote}>Walk around spaces without an account. No saves.</p>
            </div>
        </div>
    );
}

const S: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #0f172a, #1a1035, #0f1a2e)",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
    },
    orb1: {
        position: "absolute",
        top: "-10%",
        left: "-5%",
        width: 400,
        height: 400,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
        pointerEvents: "none",
    },
    orb2: {
        position: "absolute",
        bottom: "-10%",
        right: "-5%",
        width: 360,
        height: 360,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
        pointerEvents: "none",
    },
    card: {
        position: "relative",
        zIndex: 1,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRadius: 16,
        padding: "40px 36px",
        width: 400,
        boxSizing: "border-box",
    },

    // Logo
    logoRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        marginBottom: 6,
    },
    logoPx: {
        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
        color: "#fff",
        fontWeight: 900,
        fontSize: 13,
        letterSpacing: "0.1em",
        padding: "4px 8px",
        borderRadius: 6,
        fontFamily: "monospace",
    },
    logoText: {
        fontSize: 20,
        fontWeight: 700,
        color: "#f1f5f9",
        letterSpacing: "-0.3px",
    },
    tagline: {
        margin: "0 0 28px",
        textAlign: "center",
        fontSize: 13,
        color: "#818cf8",
        letterSpacing: "0.05em",
        fontWeight: 500,
    },

    // Tabs
    tabs: {
        display: "flex",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: 4,
        gap: 4,
        marginBottom: 24,
    },
    tab: {
        flex: 1,
        padding: "9px 0",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 500,
        color: "#94a3b8",
        borderRadius: 7,
        transition: "all 0.18s",
    },
    tabActive: {
        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
        color: "#fff",
        fontWeight: 600,
    },

    // Form
    form: {
        display: "flex",
        flexDirection: "column",
        gap: 16,
    },
    field: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
    },
    label: {
        fontSize: 13,
        fontWeight: 600,
        color: "#cbd5e1",
    },
    input: {
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.08)",
        color: "#f1f5f9",
        fontSize: 14,
        outline: "none",
    },
    error: {
        color: "#fca5a5",
        fontSize: 13,
        margin: 0,
        padding: "8px 12px",
        background: "rgba(239,68,68,0.15)",
        border: "1px solid rgba(239,68,68,0.3)",
        borderRadius: 6,
    },
    submitBtn: {
        padding: "12px",
        borderRadius: 8,
        border: "none",
        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
        color: "#fff",
        fontSize: 15,
        fontWeight: 600,
        cursor: "pointer",
        marginTop: 4,
        width: "100%",
        letterSpacing: "0.01em",
    },

    // Divider
    divider: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "20px 0",
    },
    dividerLine: {
        flex: 1,
        height: 1,
        background: "rgba(255,255,255,0.10)",
        display: "block",
    },
    dividerText: {
        fontSize: 12,
        color: "#475569",
        fontWeight: 500,
        whiteSpace: "nowrap",
    },

    // Guest
    guestBtn: {
        width: "100%",
        padding: "10px",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.15)",
        background: "transparent",
        color: "#94a3b8",
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
        letterSpacing: "0.01em",
    },
    guestNote: {
        margin: "8px 0 0",
        textAlign: "center",
        fontSize: 11,
        color: "#475569",
    },
};
