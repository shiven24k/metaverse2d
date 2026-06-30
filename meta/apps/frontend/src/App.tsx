import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import AuthPage from './AuthPage';
import SpacePage from './SpacePage';
import ProfilePage from './ProfilePage';
import Arena from './Game';
import JoinPage from './JoinPage';
import ProtectedRoute from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuthStore } from './stores/authStore';
import HomePage from './marketing/HomePage';
import AboutPage from './marketing/AboutPage';
import PricingPage from './marketing/PricingPage';
import ContactPage from './marketing/ContactPage';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function OAuthCallbackPage() {
    const navigate = useNavigate();
    const setAuth = useAuthStore((s) => s.setAuth);
    const setUser = useAuthStore((s) => s.setUser);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch(`${API}/api/v1/user/token`, { credentials: 'include' })
            .then(async r => {
                if (!r.ok) throw new Error('No active session');
                const d = await r.json();
                setAuth(d.token);
                setUser(d.userId, 'User');
                navigate('/lobby', { replace: true });
            })
            .catch(() => {
                setError('OAuth login failed. Please try again.');
                setTimeout(() => navigate('/login', { replace: true }), 2000);
            });
    }, []);

    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
                <p style={{ color: '#dc2626', fontSize: 14 }}>{error}</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
            <p style={{ color: '#6f6b82', fontSize: 14 }}>Finishing sign-in…</p>
        </div>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <Routes>
                {/* Marketing pages */}
                <Route path="/" element={<HomePage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/contact" element={<ContactPage />} />

                {/* App pages */}
                <Route path="/login" element={<AuthPage />} />
                <Route path="/join/:token" element={<JoinPage />} />
                <Route path="/auth/callback" element={<OAuthCallbackPage />} />
                <Route element={<ProtectedRoute />}>
                    <Route path="/lobby" element={
                        <ErrorBoundary>
                            <SpacePage />
                        </ErrorBoundary>
                    } />
                    <Route path="/arena" element={
                        <ErrorBoundary>
                            <Arena />
                        </ErrorBoundary>
                    } />
                    <Route path="/profile/:userId" element={<ProfilePage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </ErrorBoundary>
    );
}
