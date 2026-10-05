import { create } from 'zustand';
import type { VideoDetails } from '../api/types';
import type { VideoLite } from './library';

export interface PlaylistContext {
  id: string;
  title: string;
  author?: string;
  videos: VideoLite[];
  index: number;
  local?: boolean;
  loop: boolean;
  shuffle: boolean;
}

/** Imperative controls exposed by the mounted player (used by the miniplayer and shortcuts). */
export interface PlayerControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  getTime: () => number;
  isPaused: () => boolean;
}

interface PlayerSessionState {
  videoId: string | null;
  video: VideoDetails | null;
  startAt: number;
  mini: boolean;
  playlist: PlaylistContext | null;
  controls: PlayerControls | null;
  paused: boolean;
  /** loop the current video (shared by the player menu and the utility toolbar) */
  loop: boolean;
  videoEl: HTMLVideoElement | null;
  /** incremented whenever the watch page asks the player to seek (e.g. clicking a timestamp) */
  seekRequest: { t: number; n: number } | null;

  load: (videoId: string, startAt?: number) => void;
  setVideo: (v: VideoDetails | null) => void;
  setMini: (mini: boolean) => void;
  setPlaylist: (p: PlaylistContext | null) => void;
  setControls: (c: PlayerControls | null) => void;
  setPaused: (p: boolean) => void;
  setLoop: (loop: boolean) => void;
  requestSeek: (t: number) => void;
  close: () => void;
}

export const usePlayerSession = create<PlayerSessionState>()((set, get) => ({
  videoId: null,
  video: null,
  startAt: 0,
  mini: false,
  playlist: null,
  controls: null,
  paused: true,
  loop: false,
  videoEl: null,
  seekRequest: null,
  load: (videoId, startAt = 0) => {
    if (get().videoId === videoId) {
      if (startAt) get().requestSeek(startAt);
      return;
    }
    set({ videoId, startAt, video: get().video?.videoId === videoId ? get().video : null });
  },
  setVideo: (video) => set({ video }),
  setMini: (mini) => set({ mini }),
  setPlaylist: (playlist) => set({ playlist }),
  setControls: (controls) => set({ controls }),
  setPaused: (paused) => set({ paused }),
  setLoop: (loop) => set({ loop }),
  requestSeek: (t) => set((s) => ({ seekRequest: { t, n: (s.seekRequest?.n ?? 0) + 1 } })),
  close: () => set({ videoId: null, video: null, mini: false, playlist: null, startAt: 0 }),
}));
