import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ── Validation helpers ─────────────────────────────────────────────────
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_USERNAME = /^[a-zA-Z0-9_]{3,20}$/;

function validateEmail(v: string): string {
    if (!v) return "Email is required";
    if (!RE_EMAIL.test(v)) return "Enter a valid email address";
    return "";
}

function validatePassword(v: string, isSignup: boolean): string {
    if (!v) return "Password is required";
    if (isSignup && v.length < 8) return "Password must be at least 8 characters";
    return "";
}

function validateUsername(v: string): string {
    if (!v) return "Username is required";
    if (v.length < 3) return "At least 3 characters";
    if (v.length > 20) return "At most 20 characters";
    if (!RE_USERNAME.test(v)) return "Letters, numbers and underscores only";
    return "";
}

function validateConfirm(pw: string, confirm: string): string {
    if (!confirm) return "Please confirm your password";
    if (pw !== confirm) return "Passwords do not match";
    return "";
}

function passwordStrength(v: string): 0 | 1 | 2 | 3 {
    if (v.length < 8) return 0;
    let score = 1;
    if (/[A-Z]/.test(v) || /[0-9]/.test(v)) score++;
    if (/[^a-zA-Z0-9]/.test(v) && score === 2) score++;
    return score as 0 | 1 | 2 | 3;
}

const STRENGTH_LABEL = ["", "Weak", "Fair", "Strong"] as const;
const STRENGTH_COLOR = ["", "#f97316", "#eab308", "#16a34a"] as const;

// ── SVG icons ────────────────────────────────────────────────────────
function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
    );
}

function GitHubIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.37.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.6-4.04-1.6-.54-1.38-1.33-1.75-1.33-1.75-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.05.14 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
        </svg>
    );
}

// ── Component ────────────────────────────────────────────────────────
type FieldErrors = { email: string; password: string; confirmPassword: string; username: string };
type FieldTouched = { email: boolean; password: boolean; confirmPassword: boolean; username: boolean };

export default function AuthPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const setAuth = useAuthStore((s) => s.setAuth);
    const setGuest = useAuthStore((s) => s.setGuest);
    const [mode, setMode] = useState<"signin" | "signup">("signin");

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({ email: "", password: "", confirmPassword: "", username: "" });
    const [touched, setTouched] = useState<FieldTouched>({ email: false, password: false, confirmPassword: false, username: false });
    const [submitAttempted, setSubmitAttempted] = useState(false);

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);

    const isSignup = mode === "signup";
    const redirect = searchParams.get("redirect") || "/lobby";

    const validateAll = () => {
        const errs: FieldErrors = {
            email: validateEmail(email),
            password: validatePassword(password, isSignup),
            confirmPassword: isSignup ? validateConfirm(password, confirmPassword) : "",
            username: isSignup ? validateUsername(username) : "",
        };
        setFieldErrors(errs);
        return Object.values(errs).every(e => !e);
    };

    const handleBlur = (field: keyof FieldTouched) => {
        setTouched(prev => ({ ...prev, [field]: true }));
        setFieldErrors(prev => ({
            ...prev,
            email: field === "email" ? validateEmail(email) : prev.email,
            password: field === "password" ? validatePassword(password, isSignup) : prev.password,
            confirmPassword: field === "confirmPassword" ? validateConfirm(password, confirmPassword) : prev.confirmPassword,
            username: field === "username" ? validateUsername(username) : prev.username,
        }));
    };

    const showError = (field: keyof FieldErrors) =>
        (touched[field] || submitAttempted) && !!fieldErrors[field];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitAttempted(true);
        if (!validateAll()) return;
        setError("");
        setLoading(true);

        try {
            if (isSignup) {
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
                    setError("Account created — please sign in.");
                    setMode("signin");
                    return;
                }
                const token = signInRes.headers.get("set-auth-token") ?? "";
                setAuth(token);
                navigate(redirect, { replace: true });
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
                navigate(redirect, { replace: true });
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    const handleOAuth = async (provider: "google" | "github") => {
        setOauthLoading(provider);
        try {
            const res = await fetch(`${API}/api/auth/sign-in/social`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    provider,
                    callbackURL: `${window.location.origin}/auth/callback`,
                }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                console.error('No redirect URL from OAuth', data);
                setError(`${provider === 'google' ? 'Google' : 'GitHub'} sign-in is not configured.`);
                setOauthLoading(null);
            }
        } catch (err) {
            console.error('OAuth error', err);
            setError('OAuth sign-in failed. Please try again.');
            setOauthLoading(null);
        }
    };

    const switchMode = (m: "signin" | "signup") => {
        setMode(m);
        setError("");
        setFieldErrors({ email: "", password: "", confirmPassword: "", username: "" });
        setTouched({ email: false, password: false, confirmPassword: false, username: false });
        setSubmitAttempted(false);
    };

    const pwStrength = isSignup ? passwordStrength(password) : 0;

    return (
        <div style={s.page}>
            <div style={s.card}>
                <div style={s.logoRow}>
                    <img src="/logo.svg" alt="OfficeVerse 2D" style={{ width: 40, height: 40, borderRadius: 10 }} />
                    <span style={s.logoText}>OfficeVerse <span style={{ color: "#8b5cf6" }}>2D</span></span>
                </div>
                <p style={s.tagline}>Explore. Build. Connect.</p>

                {/* OAuth buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                    <button
                        onClick={() => handleOAuth("google")}
                        disabled={!!oauthLoading}
                        style={s.oauthBtnWhite}
                    >
                        <GoogleIcon />
                        <span>{oauthLoading === "google" ? "Redirecting…" : "Continue with Google"}</span>
                    </button>
                    <button
                        onClick={() => handleOAuth("github")}
                        disabled={!!oauthLoading}
                        style={s.oauthBtnDark}
                    >
                        <GitHubIcon />
                        <span>{oauthLoading === "github" ? "Redirecting…" : "Continue with GitHub"}</span>
                    </button>
                </div>

                <div style={s.divider}>
                    <span style={s.dividerLine} />
                    <span style={s.dividerText}>or sign in with email</span>
                    <span style={s.dividerLine} />
                </div>

                <div style={s.tabs}>
                    <button style={{ ...s.tab, ...(mode === "signin" ? s.tabActive : {}) }} onClick={() => switchMode("signin")}>
                        Sign In
                    </button>
                    <button style={{ ...s.tab, ...(mode === "signup" ? s.tabActive : {}) }} onClick={() => switchMode("signup")}>
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={s.form} noValidate>
                    {isSignup && (
                        <div style={s.field}>
                            <label style={s.label}>Username</label>
                            <input
                                style={{ ...s.input, borderColor: showError("username") ? "#fca5a5" : "#d4d0e6" }}
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onBlur={() => handleBlur("username")}
                                placeholder="your_username"
                                autoComplete="username"
                            />
                            {showError("username") && <p style={s.fieldErr}>{fieldErrors.username}</p>}
                        </div>
                    )}

                    <div style={s.field}>
                        <label style={s.label}>Email</label>
                        <input
                            style={{ ...s.input, borderColor: showError("email") ? "#fca5a5" : "#d4d0e6" }}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onBlur={() => handleBlur("email")}
                            placeholder="you@example.com"
                            autoComplete="email"
                        />
                        {showError("email") && <p style={s.fieldErr}>{fieldErrors.email}</p>}
                    </div>

                    <div style={s.field}>
                        <label style={s.label}>Password</label>
                        <input
                            style={{ ...s.input, borderColor: showError("password") ? "#fca5a5" : "#d4d0e6" }}
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onBlur={() => handleBlur("password")}
                            placeholder="••••••••"
                            autoComplete={isSignup ? "new-password" : "current-password"}
                        />
                        {showError("password") && <p style={s.fieldErr}>{fieldErrors.password}</p>}
                        {isSignup && password && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                                <div style={{ display: "flex", gap: 4, flex: 1 }}>
                                    {[1, 2, 3].map(i => (
                                        <div key={i} style={{ height: 3, flex: 1, borderRadius: 4, background: pwStrength >= i ? STRENGTH_COLOR[pwStrength] : "#e3e1ee", transition: "background 0.2s" }} />
                                    ))}
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 700, color: pwStrength ? STRENGTH_COLOR[pwStrength] : "#9592aa", minWidth: 36 }}>
                                    {pwStrength ? STRENGTH_LABEL[pwStrength] : ""}
                                </span>
                            </div>
                        )}
                    </div>

                    {isSignup && (
                        <div style={s.field}>
                            <label style={s.label}>Confirm Password</label>
                            <input
                                style={{ ...s.input, borderColor: showError("confirmPassword") ? "#fca5a5" : "#d4d0e6" }}
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                onBlur={() => handleBlur("confirmPassword")}
                                placeholder="••••••••"
                                autoComplete="new-password"
                            />
                            {showError("confirmPassword") && <p style={s.fieldErr}>{fieldErrors.confirmPassword}</p>}
                        </div>
                    )}

                    {error && <p style={s.error}>{error}</p>}

                    <button style={{ ...s.submitBtn, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
                        {loading ? "Loading…" : isSignup ? "Create Account" : "Sign In"}
                    </button>
                </form>

                <div style={{ ...s.divider, margin: "18px 0" }}>
                    <span style={s.dividerLine} />
                    <span style={s.dividerText}>or</span>
                    <span style={s.dividerLine} />
                </div>

                <button style={s.guestBtn} onClick={() => { setGuest(); navigate("/lobby", { replace: true }); }}>
                    Browse as Guest
                </button>
                <p style={s.guestNote}>Walk around spaces without an account. No saves.</p>
            </div>
        </div>
    );
}

const s: Record<string, React.CSSProperties> = {
    page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5", fontFamily: "system-ui, sans-serif" },
    card: { background: "#fff", border: "1px solid #ece9f7", borderRadius: 16, padding: "36px 32px", width: 420, boxSizing: "border-box", boxShadow: "0 6px 18px rgba(99,102,241,.10)" },
    logoRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 },
    logoText: { fontSize: 20, fontWeight: 700, color: "#191427", letterSpacing: "-0.3px" },
    tagline: { margin: "0 0 22px", textAlign: "center", fontSize: 13, color: "#6f6b82", fontWeight: 500 },
    oauthBtnWhite: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "10px 16px", borderRadius: 9, border: "1.5px solid #d4d0e6", background: "#fff", color: "#191427", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" },
    oauthBtnDark: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "10px 16px", borderRadius: 9, border: "none", background: "#24292e", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "opacity 0.15s" },
    divider: { display: "flex", alignItems: "center", gap: 10, margin: "0 0 18px" },
    dividerLine: { flex: 1, height: 1, background: "#ecebf3", display: "block" },
    dividerText: { fontSize: 11, color: "#6f6b82", fontWeight: 500, whiteSpace: "nowrap" },
    tabs: { display: "flex", background: "#f4f3f9", border: "1px solid #ecebf3", borderRadius: 10, padding: 4, gap: 4, marginBottom: 20 },
    tab: { flex: 1, padding: "9px 0", border: "none", background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#6f6b82", borderRadius: 7, transition: "all 0.18s", fontFamily: "inherit" },
    tabActive: { background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontWeight: 600 },
    form: { display: "flex", flexDirection: "column", gap: 14 },
    field: { display: "flex", flexDirection: "column", gap: 5 },
    label: { fontSize: 13, fontWeight: 600, color: "#191427" },
    input: { padding: "10px 12px", borderRadius: 8, border: "1.5px solid #d4d0e6", background: "#fff", color: "#191427", fontSize: 14, outline: "none", fontFamily: "inherit", transition: "border-color 0.15s", boxSizing: "border-box" },
    fieldErr: { margin: 0, fontSize: 11, color: "#dc2626", fontWeight: 500 },
    error: { color: "#dc2626", fontSize: 13, margin: 0, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6 },
    submitBtn: { padding: "12px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 2, width: "100%", letterSpacing: "0.01em", boxShadow: "0 4px 12px rgba(124,58,237,.25)", fontFamily: "inherit" },
    guestBtn: { width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d4d0e6", background: "#fff", color: "#6f6b82", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
    guestNote: { margin: "8px 0 0", textAlign: "center", fontSize: 11, color: "#6f6b82" },
};
