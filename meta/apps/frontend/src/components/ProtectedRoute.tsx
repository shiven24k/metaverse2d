import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function ProtectedRoute() {
    const token = useAuthStore((s) => s.token);
    const isGuest = useAuthStore((s) => s.isGuest);
    if (!token && !isGuest) return <Navigate to="/login" replace />;
    return <Outlet />;
}
