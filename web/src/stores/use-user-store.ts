"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { AUTH_TOKEN_KEY, fetchCurrentUser, loginWithClaude360APIKey, type AuthUser } from "@/services/api/auth";

type UserStore = {
    token: string;
    user: AuthUser | null;
    isReady: boolean;
    isLoading: boolean;
    setSession: (token: string, user: AuthUser) => void;
    clearSession: () => void;
    hydrateUser: () => Promise<void>;
    loginWithClaude360APIKey: (apiKey: string) => Promise<{ user: AuthUser; baseUrl: string; models: string[] }>;
};

export const useUserStore = create<UserStore>()(
    persist(
        (set, get) => ({
            token: "",
            user: null,
            isReady: false,
            isLoading: false,
            setSession: (token, user) => set({ token, user, isReady: true }),
            clearSession: () => set({ token: "", user: null, isReady: true }),
            hydrateUser: async () => {
                const token = get().token;
                if (!token) {
                    set({ user: null, isReady: true });
                    return;
                }
                set({ isLoading: true });
                try {
                    const user = await fetchCurrentUser(token);
                    if (user.role === "guest") {
                        set({ token: "", user: null, isReady: true, isLoading: false });
                        return;
                    }
                    set({ user, isReady: true, isLoading: false });
                } catch {
                    set({ token: "", user: null, isReady: true, isLoading: false });
                }
            },
            loginWithClaude360APIKey: async (apiKey) => {
                set({ isLoading: true });
                try {
                    const session = await loginWithClaude360APIKey({ apiKey });
                    set({ token: session.token, user: session.user, isReady: true, isLoading: false });
                    return { user: session.user, baseUrl: session.baseUrl, models: session.models || [] };
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },
        }),
        {
            name: AUTH_TOKEN_KEY,
            partialize: (state) => ({ token: state.token }),
            onRehydrateStorage: () => (state) => {
                if (state) state.isReady = false;
            },
        },
    ),
);
