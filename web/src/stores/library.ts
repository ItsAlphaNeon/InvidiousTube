import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Minimal video record kept in local storage. */
export interface VideoLite {
  videoId: string;
  title: string;
  author: string;
  authorId: string;
  lengthSeconds: number;
  viewCount?: number;
  published?: number;
  authorVerified?: boolean;
  liveNow?: boolean;
}

export interface LocalSub {
  authorId: string;
  author: string;
  thumbnail?: string;
  subscribedAt: number;
  notify: 'all' | 'personalized' | 'none';
}

export interface HistoryEntry extends VideoLite {
  watchedAt: number;
  position: number;
}

export interface LocalPlaylist {
  id: string;
  title: string;
  description: string;
  privacy: 'public' | 'unlisted' | 'private';
  created: number;
  updated: number;
  videos: VideoLite[];
}

interface LibraryState {
  subscriptions: LocalSub[];
  history: HistoryEntry[];
  historyPaused: boolean;
  watchLater: VideoLite[];
  liked: VideoLite[];
  disliked: string[];
  playlists: LocalPlaylist[];
  notInterested: string[];
  searchHistory: string[];

  subscribe: (s: Omit<LocalSub, 'subscribedAt' | 'notify'>) => void;
  unsubscribe: (authorId: string) => void;
  setNotify: (authorId: string, notify: LocalSub['notify']) => void;
  importSubscriptions: (subs: { authorId: string; author: string }[]) => number;

  recordWatch: (v: VideoLite, position: number) => void;
  removeHistory: (videoId: string) => void;
  clearHistory: () => void;
  setHistoryPaused: (p: boolean) => void;

  toggleWatchLater: (v: VideoLite) => boolean;
  removeWatchLater: (videoId: string) => void;

  setRating: (v: VideoLite, rating: 'like' | 'dislike' | 'none') => void;

  createPlaylist: (title: string, privacy?: LocalPlaylist['privacy'], first?: VideoLite) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, title: string, description?: string) => void;
  togglePlaylistVideo: (id: string, v: VideoLite) => boolean;
  removePlaylistVideo: (id: string, videoId: string) => void;

  markNotInterested: (videoId: string) => void;
  addSearch: (q: string) => void;
  removeSearch: (q: string) => void;
}

const HISTORY_LIMIT = 3000;

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      subscriptions: [],
      history: [],
      historyPaused: false,
      watchLater: [],
      liked: [],
      disliked: [],
      playlists: [],
      notInterested: [],
      searchHistory: [],

      subscribe: (s) =>
        set((st) =>
          st.subscriptions.some((x) => x.authorId === s.authorId)
            ? st
            : { subscriptions: [...st.subscriptions, { ...s, subscribedAt: Date.now(), notify: 'personalized' }] },
        ),
      unsubscribe: (authorId) => set((st) => ({ subscriptions: st.subscriptions.filter((x) => x.authorId !== authorId) })),
      setNotify: (authorId, notify) =>
        set((st) => ({ subscriptions: st.subscriptions.map((x) => (x.authorId === authorId ? { ...x, notify } : x)) })),
      importSubscriptions: (subs) => {
        const existing = new Set(get().subscriptions.map((s) => s.authorId));
        const add = subs
          .filter((s) => s.authorId && !existing.has(s.authorId))
          .map((s) => ({ ...s, subscribedAt: Date.now(), notify: 'personalized' as const }));
        set((st) => ({ subscriptions: [...st.subscriptions, ...add] }));
        return add.length;
      },

      recordWatch: (v, position) => {
        if (get().historyPaused) return;
        set((st) => {
          const rest = st.history.filter((h) => h.videoId !== v.videoId);
          const entry: HistoryEntry = { ...v, watchedAt: Date.now(), position };
          return { history: [entry, ...rest].slice(0, HISTORY_LIMIT) };
        });
      },
      removeHistory: (videoId) => set((st) => ({ history: st.history.filter((h) => h.videoId !== videoId) })),
      clearHistory: () => set({ history: [] }),
      setHistoryPaused: (p) => set({ historyPaused: p }),

      toggleWatchLater: (v) => {
        const has = get().watchLater.some((x) => x.videoId === v.videoId);
        set((st) => ({
          watchLater: has ? st.watchLater.filter((x) => x.videoId !== v.videoId) : [...st.watchLater, v],
        }));
        return !has;
      },
      removeWatchLater: (videoId) => set((st) => ({ watchLater: st.watchLater.filter((x) => x.videoId !== videoId) })),

      setRating: (v, rating) =>
        set((st) => ({
          liked: rating === 'like' ? [v, ...st.liked.filter((x) => x.videoId !== v.videoId)] : st.liked.filter((x) => x.videoId !== v.videoId),
          disliked: rating === 'dislike' ? [...st.disliked.filter((x) => x !== v.videoId), v.videoId] : st.disliked.filter((x) => x !== v.videoId),
        })),

      createPlaylist: (title, privacy = 'private', first) => {
        const id = 'LP' + Math.random().toString(36).slice(2, 12);
        const now = Date.now();
        set((st) => ({
          playlists: [...st.playlists, { id, title, description: '', privacy, created: now, updated: now, videos: first ? [first] : [] }],
        }));
        return id;
      },
      deletePlaylist: (id) => set((st) => ({ playlists: st.playlists.filter((p) => p.id !== id) })),
      renamePlaylist: (id, title, description) =>
        set((st) => ({
          playlists: st.playlists.map((p) => (p.id === id ? { ...p, title, description: description ?? p.description, updated: Date.now() } : p)),
        })),
      togglePlaylistVideo: (id, v) => {
        const pl = get().playlists.find((p) => p.id === id);
        const has = !!pl?.videos.some((x) => x.videoId === v.videoId);
        set((st) => ({
          playlists: st.playlists.map((p) =>
            p.id === id
              ? { ...p, updated: Date.now(), videos: has ? p.videos.filter((x) => x.videoId !== v.videoId) : [...p.videos, v] }
              : p,
          ),
        }));
        return !has;
      },
      removePlaylistVideo: (id, videoId) =>
        set((st) => ({
          playlists: st.playlists.map((p) =>
            p.id === id ? { ...p, updated: Date.now(), videos: p.videos.filter((x) => x.videoId !== videoId) } : p,
          ),
        })),

      markNotInterested: (videoId) => set((st) => ({ notInterested: [...st.notInterested, videoId].slice(-1000) })),
      addSearch: (q) => {
        const t = q.trim();
        if (!t) return;
        set((st) => ({ searchHistory: [t, ...st.searchHistory.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 50) }));
      },
      removeSearch: (q) => set((st) => ({ searchHistory: st.searchHistory.filter((x) => x !== q) })),
    }),
    { name: 'itube-library', version: 1 },
  ),
);

export function toLite(v: {
  videoId: string;
  title: string;
  author: string;
  authorId: string;
  lengthSeconds: number;
  viewCount?: number;
  published?: number | string;
  authorVerified?: boolean;
  liveNow?: boolean;
}): VideoLite {
  return {
    videoId: v.videoId,
    title: v.title,
    author: v.author,
    authorId: v.authorId,
    lengthSeconds: v.lengthSeconds,
    viewCount: v.viewCount,
    published: typeof v.published === 'string' ? Math.floor(Date.parse(v.published) / 1000) || undefined : v.published,
    authorVerified: v.authorVerified,
    liveNow: v.liveNow,
  };
}

/** Watch progress lookup used to draw the red resume bar on thumbnails. */
let progressSource: HistoryEntry[] | null = null;
let progressIndex = new Map<string, number>();
function positionOf(history: HistoryEntry[], videoId: string): number | undefined {
  if (history !== progressSource) {
    progressSource = history;
    progressIndex = new Map(history.map((h) => [h.videoId, h.position]));
  }
  return progressIndex.get(videoId);
}

export function useWatchProgress(videoId: string, lengthSeconds?: number): number {
  return useLibrary((s) => {
    const pos = positionOf(s.history, videoId);
    if (pos == null || !lengthSeconds) return 0;
    // Treat videos watched to (almost) the end as fully watched, like YouTube.
    if (lengthSeconds - pos < 10) return 1;
    return Math.min(1, pos / lengthSeconds);
  });
}

export function getResumePosition(videoId: string): number {
  const pos = positionOf(useLibrary.getState().history, videoId);
  return pos ?? 0;
}
