import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/invidious';
import { avatarUrl } from '../api/images';
import type { VideoItem } from '../api/types';
import { useAuth } from '../stores/auth';
import { useLibrary, type VideoLite } from '../stores/library';
import { toast } from '../stores/ui';

export interface SubInfo {
  authorId: string;
  author: string;
  thumbnail?: string;
}

/** Persistent cache of channel avatars (Invidious' subscription list has no thumbnails). */
const useAvatarCache = create<{ map: Record<string, string>; put: (id: string, url: string) => void }>()(
  persist(
    (set) => ({
      map: {},
      put: (id, url) => set((s) => ({ map: { ...s.map, [id]: url } })),
    }),
    { name: 'itube-avatars' },
  ),
);

const pendingAvatars = new Set<string>();
export function useChannelAvatar(authorId: string, known?: string): string | undefined {
  const cached = useAvatarCache((s) => s.map[authorId]);
  useEffect(() => {
    if (known || cached || !authorId || pendingAvatars.has(authorId)) return;
    pendingAvatars.add(authorId);
    fetch(`/api/v1/channels/${encodeURIComponent(authorId)}?fields=authorThumbnails`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const url = d?.authorThumbnails ? avatarUrl(d.authorThumbnails, 48) : '';
        if (url) useAvatarCache.getState().put(authorId, url);
      })
      .catch(() => undefined);
  }, [authorId, known, cached]);
  return known || cached;
}
export function rememberAvatar(authorId: string, url?: string) {
  if (url) useAvatarCache.getState().put(authorId, url);
}

// ------------------------------------------------------------------ subscriptions

export function useSubscriptions(): { subs: SubInfo[]; isLoading: boolean } {
  const loggedIn = useAuth((s) => s.loggedIn);
  const local = useLibrary((s) => s.subscriptions);
  const remote = useQuery({
    queryKey: ['auth', 'subscriptions'],
    queryFn: api.authSubscriptions,
    enabled: loggedIn,
    staleTime: 5 * 60 * 1000,
  });
  const subs = useMemo<SubInfo[]>(() => {
    if (loggedIn) return (remote.data || []).map((s) => ({ authorId: s.authorId, author: s.author }));
    return local.map((s) => ({ authorId: s.authorId, author: s.author, thumbnail: s.thumbnail }));
  }, [loggedIn, local, remote.data]);
  return { subs, isLoading: loggedIn && remote.isLoading };
}

export function useIsSubscribed(authorId: string): boolean {
  const { subs } = useSubscriptions();
  return subs.some((s) => s.authorId === authorId);
}

export function useSubscribeActions() {
  const loggedIn = useAuth((s) => s.loggedIn);
  const qc = useQueryClient();
  const lib = useLibrary.getState;
  const mutation = useMutation({
    mutationFn: async ({ sub, on }: { sub: SubInfo; on: boolean }) => {
      if (on) await api.authSubscribe(sub.authorId);
      else await api.authUnsubscribe(sub.authorId);
    },
    onMutate: async ({ sub, on }) => {
      await qc.cancelQueries({ queryKey: ['auth', 'subscriptions'] });
      qc.setQueryData<{ author: string; authorId: string }[]>(['auth', 'subscriptions'], (old = []) =>
        on ? [...old, { author: sub.author, authorId: sub.authorId }] : old.filter((s) => s.authorId !== sub.authorId),
      );
    },
    onError: () => toast('Something went wrong. Please try again.'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'subscriptions'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  return {
    subscribe: (sub: SubInfo) => {
      rememberAvatar(sub.authorId, sub.thumbnail);
      if (loggedIn) mutation.mutate({ sub, on: true });
      else lib().subscribe(sub);
      toast('Subscription added');
    },
    unsubscribe: (sub: SubInfo) => {
      if (loggedIn) mutation.mutate({ sub, on: false });
      else lib().unsubscribe(sub.authorId);
      toast('Subscription removed', {
        action: {
          label: 'Undo',
          onClick: () => (loggedIn ? mutation.mutate({ sub, on: true }) : lib().subscribe(sub)),
        },
      });
    },
  };
}

// ------------------------------------------------------------------ subscription feed

export function useSubscriptionFeed(enabled = true) {
  const loggedIn = useAuth((s) => s.loggedIn);
  const checked = useAuth((s) => s.checked);
  const localIds = useLibrary((s) => s.subscriptions.map((x) => x.authorId).join(','));
  return useInfiniteQuery({
    queryKey: ['feed', loggedIn ? 'auth' : localIds],
    enabled: enabled && checked && (loggedIn || localIds.length > 0),
    initialPageParam: 1,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ pageParam }) => {
      if (loggedIn) {
        const r = await api.authFeed(pageParam, 60);
        const videos = [...(pageParam === 1 ? r.notifications || [] : []), ...(r.videos || [])];
        return { videos, hasMore: (r.videos || []).length >= 30 };
      }
      return api.localFeed(localIds.split(','), pageParam);
    },
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
  });
}

export function flattenFeed(pages?: { videos: VideoItem[] }[]): VideoItem[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: VideoItem[] = [];
  for (const p of pages)
    for (const v of p.videos) {
      if (seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      out.push(v);
    }
  return out;
}

// ------------------------------------------------------------------ history

const pushedHistory = new Set<string>();
export function useRecordHistory() {
  const loggedIn = useAuth((s) => s.loggedIn);
  return (v: VideoLite, position: number) => {
    useLibrary.getState().recordWatch(v, position);
    if (loggedIn && !useLibrary.getState().historyPaused && !pushedHistory.has(v.videoId)) {
      pushedHistory.add(v.videoId);
      api.authAddHistory(v.videoId).catch(() => pushedHistory.delete(v.videoId));
    }
  };
}

// ------------------------------------------------------------------ playlists

export interface PlaylistSummary {
  id: string;
  title: string;
  videoCount: number;
  privacy: string;
  updated: number;
  firstVideoId?: string;
  local: boolean;
  videoIds: string[];
}

export function useMyPlaylists(): { playlists: PlaylistSummary[]; isLoading: boolean } {
  const loggedIn = useAuth((s) => s.loggedIn);
  const local = useLibrary((s) => s.playlists);
  const remote = useQuery({ queryKey: ['auth', 'playlists'], queryFn: api.authPlaylists, enabled: loggedIn, staleTime: 60_000 });
  const playlists = useMemo<PlaylistSummary[]>(() => {
    if (loggedIn)
      return (remote.data || []).map((p) => ({
        id: p.playlistId,
        title: p.title,
        videoCount: p.videoCount,
        privacy: p.privacy || (p.isListed ? 'public' : 'private'),
        updated: p.updated,
        firstVideoId: p.videos?.[0]?.videoId,
        local: false,
        videoIds: (p.videos || []).map((v) => v.videoId),
      }));
    return local.map((p) => ({
      id: p.id,
      title: p.title,
      videoCount: p.videos.length,
      privacy: p.privacy,
      updated: Math.floor(p.updated / 1000),
      firstVideoId: p.videos[0]?.videoId,
      local: true,
      videoIds: p.videos.map((v) => v.videoId),
    }));
  }, [loggedIn, local, remote.data]);
  return { playlists, isLoading: loggedIn && remote.isLoading };
}

export function usePlaylistActions() {
  const loggedIn = useAuth((s) => s.loggedIn);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['auth', 'playlists'] });
  return {
    create: async (title: string, privacy: 'public' | 'unlisted' | 'private', first?: VideoLite) => {
      if (!loggedIn) return useLibrary.getState().createPlaylist(title, privacy, first);
      const r = await api.authCreatePlaylist(title, privacy);
      if (first) await api.authAddToPlaylist(r.playlistId, first.videoId);
      refresh();
      return r.playlistId;
    },
    toggle: async (pl: PlaylistSummary, v: VideoLite): Promise<boolean> => {
      if (pl.local) return useLibrary.getState().togglePlaylistVideo(pl.id, v);
      if (pl.videoIds.includes(v.videoId)) {
        const full = await api.authPlaylist(pl.id);
        const item = full.videos.find((x) => x.videoId === v.videoId);
        if (item?.indexId) await api.authRemoveFromPlaylist(pl.id, item.indexId);
        refresh();
        return false;
      }
      await api.authAddToPlaylist(pl.id, v.videoId);
      refresh();
      return true;
    },
    remove: async (plId: string, local: boolean, videoId: string, indexId?: string) => {
      if (local) return useLibrary.getState().removePlaylistVideo(plId, videoId);
      if (indexId) await api.authRemoveFromPlaylist(plId, indexId);
      qc.invalidateQueries({ queryKey: ['playlist', plId] });
      refresh();
    },
    destroy: async (plId: string, local: boolean) => {
      if (local) return useLibrary.getState().deletePlaylist(plId);
      await api.authDeletePlaylist(plId);
      refresh();
    },
  };
}
