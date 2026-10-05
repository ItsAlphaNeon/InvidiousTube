import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/invidious';
import { useSettings } from '../stores/settings';

/** YouTube Shorts are at most 3 minutes long; anything longer is always a regular video. */
const MAX_SHORT_SECONDS = 180;
const CHUNK = 12;
const CACHE_LIMIT = 8000;

interface Filterable {
  videoId?: string;
  lengthSeconds?: number;
  title?: string;
  type?: string;
  liveNow?: boolean;
}

/** Remembers which videos are Shorts across reloads (results never change). */
const useShortsCache = create<{ known: Record<string, boolean>; add: (shorts: string[], videos: string[]) => void }>()(
  persist(
    (set) => ({
      known: {},
      add: (shorts, videos) =>
        set((s) => {
          const known = { ...s.known };
          for (const id of shorts) known[id] = true;
          for (const id of videos) known[id] = false;
          const keys = Object.keys(known);
          if (keys.length > CACHE_LIMIT) for (const k of keys.slice(0, keys.length - CACHE_LIMIT)) delete known[k];
          return { known };
        }),
    }),
    { name: 'itube-shorts' },
  ),
);

// Note: Invidious' "shortVideo" type is just its compact video object (every subscription-feed
// entry uses it), not a YouTube Short, so it must not be used as a signal here.
function obviousShort(v: Filterable): boolean {
  return /#shorts?\b/i.test(v.title || '');
}

/** Only videos that could be Shorts (short or unknown length, not live) need a server check. */
function needsCheck(v: Filterable): boolean {
  if (!v.videoId || v.liveNow || obviousShort(v)) return false;
  return !v.lengthSeconds || v.lengthSeconds <= MAX_SHORT_SECONDS;
}

/**
 * Removes YouTube Shorts from a list when "Hide Shorts" is on. Videos that might be Shorts are
 * hidden until the server confirms them, so Shorts never flash into the feed.
 */
export function useShortsFilter<T extends Filterable>(items: T[]): { items: T[]; pending: boolean } {
  const hide = useSettings((s) => s.hideShorts);
  const known = useShortsCache((s) => s.known);
  const add = useShortsCache((s) => s.add);
  const { data: cfg } = useQuery({ queryKey: ['x-config'], queryFn: api.config, staleTime: Infinity });
  const serverCheck = cfg?.shortsCheck !== false;

  // Chunk over every candidate (known or not) so chunk membership stays stable while results arrive
  const chunks = useMemo(() => {
    if (!hide || !serverCheck) return [];
    const ids = [...new Set(items.filter(needsCheck).map((v) => v.videoId!))];
    const out: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK));
    return out;
  }, [items, hide, serverCheck]);

  const results = useQueries({
    queries: chunks.map((ids) => ({
      queryKey: ['shorts-check', ids.join(',')],
      queryFn: () => api.checkShorts(ids),
      staleTime: Infinity,
      retry: 1,
      enabled: ids.some((id) => useShortsCache.getState().known[id] === undefined),
    })),
  });

  const settled = results.map((r) => r.dataUpdatedAt).join();
  useEffect(() => {
    const shorts: string[] = [];
    const videos: string[] = [];
    for (const r of results) {
      if (!r.data) continue;
      shorts.push(...r.data.shorts.filter((id) => known[id] === undefined));
      videos.push(...r.data.videos.filter((id) => known[id] === undefined));
    }
    if (shorts.length || videos.length) add(shorts, videos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  // Checks that errored, or that YouTube couldn't answer, fall back to showing the video
  const failed = useMemo(() => {
    const out = new Set<string>();
    chunks.forEach((ids, i) => {
      const r = results[i];
      if (r?.isError) ids.forEach((id) => out.add(id));
      else if (r?.data) ids.forEach((id) => !r.data.shorts.includes(id) && !r.data.videos.includes(id) && out.add(id));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks, settled, results.map((r) => r.isError).join()]);

  const filtered = useMemo(() => {
    if (!hide) return items;
    return items.filter((v) => {
      if (!v.videoId) return true;
      if (obviousShort(v)) return false;
      if (!needsCheck(v)) return true;
      const k = known[v.videoId];
      if (k !== undefined) return !k;
      // Undetermined: hide while checking; show if the check failed or is disabled
      return !serverCheck || failed.has(v.videoId);
    });
  }, [items, hide, known, serverCheck, failed]);

  return { items: filtered, pending: results.some((r) => r.isLoading) };
}
