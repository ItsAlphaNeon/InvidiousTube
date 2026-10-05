import { useQuery } from '@tanstack/react-query';
import { api } from '../api/invidious';
import type { PlaylistDetails, VideoItem } from '../api/types';
import { useAuth } from '../stores/auth';
import { useLibrary, type VideoLite } from '../stores/library';

export interface ResolvedPlaylist {
  id: string;
  title: string;
  author?: string;
  authorId?: string;
  description?: string;
  descriptionHtml?: string;
  videoCount: number;
  viewCount?: number;
  updated?: number;
  privacy?: string;
  local: boolean;
  /** owned by the user (local or Invidious account) */
  owned: boolean;
  kind: 'watchLater' | 'liked' | 'local' | 'mix' | 'invidious' | 'youtube';
  videos: (VideoItem | (VideoLite & { indexId?: string }))[];
  thumbnail?: string;
}

async function fetchAllPages(id: string, maxPages = 5): Promise<PlaylistDetails> {
  const first = await api.playlist(id, 1);
  let all = [...first.videos];
  let page = 2;
  while (all.length < first.videoCount && page <= maxPages) {
    const p = await api.playlist(id, page);
    if (!p.videos.length) break;
    const seen = new Set(all.map((v) => v.videoId + (v.index ?? '')));
    const add = p.videos.filter((v) => !seen.has(v.videoId + (v.index ?? '')));
    if (!add.length) break;
    all = all.concat(add);
    page++;
  }
  return { ...first, videos: all };
}

export function usePlaylistData(listId: string | null) {
  const loggedIn = useAuth((s) => s.loggedIn);
  const username = useAuth((s) => s.username);
  const watchLater = useLibrary((s) => s.watchLater);
  const liked = useLibrary((s) => s.liked);
  const localPlaylists = useLibrary((s) => s.playlists);

  const isLocalKind = listId === 'WL' || listId === 'LL' || listId?.startsWith('LP');
  const remote = useQuery({
    queryKey: ['playlist', listId, loggedIn],
    enabled: !!listId && !isLocalKind,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ResolvedPlaylist> => {
      const id = listId!;
      if (id.startsWith('RD')) {
        const mix = await api.mix(id);
        return { id, title: mix.title, videoCount: mix.videos.length, local: false, owned: false, kind: 'mix', videos: mix.videos };
      }
      if (id.startsWith('IV') && loggedIn) {
        try {
          const p = await api.authPlaylist(id);
          return { ...fromDetails(p), owned: true, kind: 'invidious' };
        } catch {
          /* not ours: fall through to public */
        }
      }
      const p = await fetchAllPages(id);
      return { ...fromDetails(p), owned: false, kind: id.startsWith('IV') ? 'invidious' : 'youtube' };
    },
  });

  if (!listId) return { data: null, isLoading: false, isError: false };
  const me = username || 'You';
  if (listId === 'WL')
    return {
      data: { id: 'WL', title: 'Watch later', author: me, videoCount: watchLater.length, local: true, owned: true, kind: 'watchLater', videos: watchLater, privacy: 'private' } as ResolvedPlaylist,
      isLoading: false,
      isError: false,
    };
  if (listId === 'LL')
    return {
      data: { id: 'LL', title: 'Liked videos', author: me, videoCount: liked.length, local: true, owned: true, kind: 'liked', videos: liked, privacy: 'private' } as ResolvedPlaylist,
      isLoading: false,
      isError: false,
    };
  if (listId.startsWith('LP')) {
    const p = localPlaylists.find((x) => x.id === listId);
    return {
      data: p
        ? ({
            id: p.id,
            title: p.title,
            author: me,
            description: p.description,
            videoCount: p.videos.length,
            updated: Math.floor(p.updated / 1000),
            privacy: p.privacy,
            local: true,
            owned: true,
            kind: 'local',
            videos: p.videos,
          } as ResolvedPlaylist)
        : null,
      isLoading: false,
      isError: !p,
    };
  }
  return { data: remote.data ?? null, isLoading: remote.isLoading, isError: remote.isError };
}

function fromDetails(p: PlaylistDetails): Omit<ResolvedPlaylist, 'owned' | 'kind'> {
  return {
    id: p.playlistId,
    title: p.title,
    author: p.author,
    authorId: p.authorId,
    description: p.description,
    descriptionHtml: p.descriptionHtml,
    videoCount: p.videoCount,
    viewCount: p.viewCount,
    updated: p.updated,
    privacy: p.privacy,
    local: false,
    videos: p.videos.filter((v) => v.videoId && v.title !== '[Deleted video]' && v.title !== '[Private video]'),
    thumbnail: p.playlistThumbnail,
  };
}
