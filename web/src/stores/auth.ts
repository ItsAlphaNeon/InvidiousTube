import { create } from 'zustand';
import { api } from '../api/invidious';

interface AuthState {
  checked: boolean;
  loggedIn: boolean;
  username?: string;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>()((set) => ({
  checked: false,
  loggedIn: false,
  refresh: async () => {
    try {
      const me = await api.me();
      set({ checked: true, loggedIn: me.loggedIn, username: me.username });
    } catch {
      set({ checked: true, loggedIn: false });
    }
  },
  login: async (username, password) => {
    const r = await api.login(username, password);
    set({ checked: true, loggedIn: true, username: r.username });
  },
  logout: async () => {
    await api.logout().catch(() => undefined);
    set({ loggedIn: false, username: undefined });
  },
}));
