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
        <div style={s.page}>
            <div style={s.card}>
                <div style={s.logoRow}>
                    <span style={s.logoPx}>M2D</span>
                    <span style={s.logoText}>Metaverse 2D</span>
                </div>
                <p style={s.tagline}>Explore. Build. Connect.</p>

                <div style={s.tabs}>
                    <button
                        style={{ ...s.tab, ...(mode === "signin" ? s.tabActive : {}) }}
                        onClick={() => { setMode("signin"); setError(""); }}
                    >
                        Sign In
                    </button>
                    <button
                        style={{ ...s.tab, ...(mode === "signup" ? s.tabActive : {}) }}
                        onClick={() => { setMode("signup"); setError(""); }}
                    >
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={s.form}>
                    {mode === "signup" && (
                        <div style={s.field}>
                            <label style={s.label}>Username</label>
                            <input
                                style={s.input}
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="your_username"
                                required
                                autoComplete="username"
                            />
                        </div>
                    )}

                    <div style={s.field}>
                        <label style={s.label}>Email</label>
                        <input
                            style={s.input}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div style={s.field}>
                        <label style={s.label}>Password</label>
                        <input
                            style={s.input}
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        />
                    </div>

                    {error && <p style={s.error}>{error}</p>}

                    <button style={s.submitBtn} type="submit" disabled={loading}>
                        {loading ? "Loading\u2026" : mode === "signin" ? "Sign In" : "Create Account"}
                    </button>
                </form>

                <div style={s.divider}>
                    <span style={s.dividerLine} />
                    <span style={s.dividerText}>or</span>
                    <span style={s.dividerLine} />
                </div>

                <button
                    style={s.guestBtn}
                    onClick={() => { setGuest(); navigate("/lobby", { replace: true }); }}
                >
                    Browse as Guest
                </button>
                <p style={s.guestNote}>Walk around spaces without an account. No saves.</p>
            </div>
        </div>
    );
}

const s: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f2f5",
        fontFamily: "system-ui, sans-serif",
    },
    card: {
        background: "#fff",
        border: "1px solid #ece9f7",
        borderRadius: 16,
        padding: "40px 36px",
        width: 400,
        boxSizing: "border-box",
        boxShadow: "0 6px 18px rgba(99,102,241,.10)",
    },
    logoRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        marginBottom: 6,
    },
    logoPx: {
        background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
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
        color: "#191427",
        letterSpacing: "-0.3px",
    },
    tagline: {
        margin: "0 0 28px",
        textAlign: "center",
        fontSize: 13,
        color: "#6f6b82",
        fontWeight: 500,
    },
    tabs: {
        display: "flex",
        background: "#f4f3f9",
        border: "1px solid #ecebf3",
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
        color: "#6f6b82",
        borderRadius: 7,
        transition: "all 0.18s",
    },
    tabActive: {
        background: "linear-gradient(135deg,#7c3aed,#a78bfa)",
        color: "#fff",
        fontWeight: 600,
    },
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
        color: "#191427",
    },
    input: {
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #d4d0e6",
        background: "#fff",
        color: "#191427",
        fontSize: 14,
        outline: "none",
    },
    error: {
        color: "#dc2626",
        fontSize: 13,
        margin: 0,
        padding: "8px 12px",
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 6,
    },
    submitBtn: {
        padding: "12px",
        borderRadius: 8,
        border: "none",
        background: "linear-gradient(135deg,#7c3aed,#a78bfa)",
        color: "#fff",
        fontSize: 15,
        fontWeight: 600,
        cursor: "pointer",
        marginTop: 4,
        width: "100%",
        letterSpacing: "0.01em",
        boxShadow: "0 4px 12px rgba(124,58,237,.25)",
    },
    divider: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "20px 0",
    },
    dividerLine: {
        flex: 1,
        height: 1,
        background: "#ecebf3",
        display: "block",
    },
    dividerText: {
        fontSize: 12,
        color: "#6f6b82",
        fontWeight: 500,
        whiteSpace: "nowrap",
    },
    guestBtn: {
        width: "100%",
        padding: "10px",
        borderRadius: 8,
        border: "1px solid #d4d0e6",
        background: "#fff",
        color: "#6f6b82",
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
        letterSpacing: "0.01em",
    },
    guestNote: {
        margin: "8px 0 0",
        textAlign: "center",
        fontSize: 11,
        color: "#6f6b82",
    },
};
