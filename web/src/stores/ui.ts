import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface UIState {
  /** Whether the user expanded the guide (full guide on wide screens / drawer when narrow). */
  guideExpanded: boolean;
  drawerOpen: boolean;
  toasts: Toast[];
  toggleGuide: (isDrawerMode: boolean) => void;
  closeDrawer: () => void;
  toast: (message: string, opts?: Omit<Toast, 'id' | 'message'>) => void;
  dismissToast: (id: number) => void;
}

let toastId = 1;

export const useUI = create<UIState>()((set, get) => ({
  guideExpanded: true,
  drawerOpen: false,
  toasts: [],
  toggleGuide: (isDrawerMode) => {
    if (isDrawerMode) set({ drawerOpen: !get().drawerOpen });
    else set({ guideExpanded: !get().guideExpanded });
  },
  closeDrawer: () => set({ drawerOpen: false }),
  toast: (message, opts) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, ...opts }] }));
    setTimeout(() => get().dismissToast(id), opts?.duration ?? 4000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (message: string, opts?: Omit<Toast, 'id' | 'message'>) => useUI.getState().toast(message, opts);
