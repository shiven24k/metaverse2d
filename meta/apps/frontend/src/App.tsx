import { Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './AuthPage';
import SpacePage from './SpacePage';
import ProfilePage from './ProfilePage';
import Arena from './Game';
import ProtectedRoute from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
    return (
        <ErrorBoundary>
            <Routes>
                <Route path="/login" element={<AuthPage />} />
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
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </ErrorBoundary>
    );
}
