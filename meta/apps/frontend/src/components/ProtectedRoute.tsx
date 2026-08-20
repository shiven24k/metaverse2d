import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export default function ProtectedRoute() {
    const token = useAuthStore((s) => s.token);
    const isGuest = useAuthStore((s) => s.isGuest);
    const setUser = useAuthStore((s) => s.setUser);
    const clearAuth = useAuthStore((s) => s.clearAuth);

    const authed = Boolean(token);

    // If a token exists we must validate it BEFORE rendering the child route,
    // otherwise the child (lobby/arena) mounts and fires authenticated fetches
    // with a stale token — a burst of 403s with no way to sign out.
    const [validating, setValidating] = useState(() => authed);
    const [valid, setValid] = useState(() => !authed);

    useEffect(() => {
        if (!authed) {
            // Guest or no token — nothing to validate.
            setValid(true);
            setValidating(false);
            return;
        }

        let cancelled = false;
        setValidating(true);

        fetch(`${API}/api/v1/user/me`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async (r) => {
                if (cancelled) return;
                if (r.status === 401 || r.status === 403) {
                    // Stale / revoked / expired token — get a fresh one.
                    clearAuth();
                    setValid(false);
                } else if (r.ok) {
                    const d = await r.json();
                    if (!cancelled) {
                        setUser(d.user?.id ?? null, d.user?.role ?? null);
                        setValid(true);
                    }
                } else {
                    setValid(true);
                }
            })
            .catch(() => {
                // Network error — don't force a logout on a flaky connection.
                if (!cancelled) setValid(true);
            })
            .finally(() => {
                if (!cancelled) setValidating(false);
            });

        return () => {
            cancelled = true;
        };
    }, [authed, token, setUser, clearAuth]);

    if (!token && !isGuest) return <Navigate to="/login" replace />;
    if (authed && validating) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', background: '#f0f2f5' }}>
                <p style={{ color: '#6f6b82', fontSize: 14 }}>Checking session…</p>
            </div>
        );
    }
    if (!valid) return <Navigate to="/login" replace />;
    return <Outlet />;
}
