import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function AuthPage() {
    const navigate = useNavigate();
    const setAuth = useAuthStore((s) => s.setAuth);
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
        <div style={styles.container}>
            <div style={styles.card}>
                <h1 style={styles.title}>Metaverse 2D</h1>
                <p style={styles.subtitle}>
                    {mode === "signin" ? "Sign in to your account" : "Create an account"}
                </p>

                <div style={styles.tabs}>
                    <button
                        style={{ ...styles.tab, ...(mode === "signin" ? styles.activeTab : {}) }}
                        onClick={() => { setMode("signin"); setError(""); }}
                    >
                        Sign In
                    </button>
                    <button
                        style={{ ...styles.tab, ...(mode === "signup" ? styles.activeTab : {}) }}
                        onClick={() => { setMode("signup"); setError(""); }}
                    >
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={styles.form}>
                    {mode === "signup" && (
                        <div style={styles.field}>
                            <label style={styles.label}>Username</label>
                            <input
                                style={styles.input}
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="your_username"
                                required
                                autoComplete="username"
                            />
                        </div>
                    )}

                    <div style={styles.field}>
                        <label style={styles.label}>Email</label>
                        <input
                            style={styles.input}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Password</label>
                        <input
                            style={styles.input}
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        />
                    </div>

                    {error && <p style={styles.error}>{error}</p>}

                    <button style={styles.button} type="submit" disabled={loading}>
                        {loading ? "Loading..." : mode === "signin" ? "Sign In" : "Sign Up"}
                    </button>
                </form>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f2f5",
        fontFamily: "system-ui, sans-serif",
    },
    card: {
        background: "#fff",
        borderRadius: 12,
        padding: "40px 36px",
        width: 380,
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
    },
    title: {
        margin: 0,
        fontSize: 26,
        fontWeight: 700,
        color: "#1a1a2e",
        textAlign: "center",
    },
    subtitle: {
        margin: "8px 0 24px",
        color: "#666",
        textAlign: "center",
        fontSize: 14,
    },
    tabs: {
        display: "flex",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid #e0e0e0",
        marginBottom: 24,
    },
    tab: {
        flex: 1,
        padding: "10px 0",
        border: "none",
        background: "#f8f8f8",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 500,
        color: "#666",
        transition: "all 0.2s",
    },
    activeTab: {
        background: "#4f46e5",
        color: "#fff",
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
        color: "#333",
    },
    input: {
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        fontSize: 14,
        outline: "none",
        transition: "border-color 0.2s",
    },
    error: {
        color: "#ef4444",
        fontSize: 13,
        margin: 0,
        padding: "8px 12px",
        background: "#fef2f2",
        borderRadius: 6,
    },
    button: {
        padding: "12px",
        borderRadius: 8,
        border: "none",
        background: "#4f46e5",
        color: "#fff",
        fontSize: 15,
        fontWeight: 600,
        cursor: "pointer",
        marginTop: 4,
        transition: "background 0.2s",
    },
};
