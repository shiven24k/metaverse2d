import { Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './AuthPage';
import SpacePage from './SpacePage';
import ProfilePage from './ProfilePage';
import Arena from './Game';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route element={<ProtectedRoute />}>
                <Route path="/lobby" element={<SpacePage />} />
                <Route path="/arena" element={<Arena />} />
                <Route path="/profile/:userId" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    );
}
