import { create } from 'zustand';

const TOKEN_KEY = 'metaverse_token';

interface AuthState {
    token: string;
    userId: string | null;
    role: string | null;
    setAuth: (token: string) => void;
    setUser: (userId: string, role: string) => void;
    clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    userId: null,
    role: null,
    setAuth: (token: string) => {
        localStorage.setItem(TOKEN_KEY, token);
        set({ token });
    },
    setUser: (userId, role) => set({ userId, role }),
    clearAuth: () => {
        localStorage.removeItem(TOKEN_KEY);
        set({ token: '', userId: null, role: null });
    },
}));
