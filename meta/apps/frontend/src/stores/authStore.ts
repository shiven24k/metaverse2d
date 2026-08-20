import { create } from 'zustand';

const TOKEN_KEY = 'metaverse_token';
const GUEST_KEY = 'metaverse_guest';

interface AuthState {
    token: string;
    userId: string | null;
    role: string | null;
    isGuest: boolean;
    setAuth: (token: string) => void;
    setUser: (userId: string, role: string) => void;
    setGuest: () => void;
    clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    userId: null,
    role: null,
    isGuest: localStorage.getItem(GUEST_KEY) === 'true',
    setAuth: (token: string) => {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.removeItem(GUEST_KEY);
        set({ token, isGuest: false });
    },
    setUser: (userId, role) => set({ userId, role }),
    setGuest: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.setItem(GUEST_KEY, 'true');
        set({ token: '', isGuest: true, userId: null, role: null });
    },
    clearAuth: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(GUEST_KEY);
        set({ token: '', userId: null, role: null, isGuest: false });
    },
}));

// Keep multiple open tabs in sync: if a token or guest flag changes in another tab
// (sign-in / sign-out / guest mode), update this tab's in-memory store so it doesn't
// keep calling the API with a token that another tab just revoked or replaced.
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === TOKEN_KEY) {
            useAuthStore.setState({ token: e.newValue ?? '', isGuest: false, userId: null, role: null });
        } else if (e.key === GUEST_KEY) {
            useAuthStore.setState({ isGuest: e.newValue === 'true', token: localStorage.getItem(TOKEN_KEY) ?? '' });
        }
    });
}
