import type {
  AuthPlaylist,
  AuthSubscription,
  ChannelDetails,
  ChannelPlaylistsResponse,
  ChannelVideosResponse,
  CommentsResponse,
  CommunityResponse,
  MixDetails,
  PlaylistDetails,
  SearchItem,
  SponsorSegment,
  VideoDetails,
  VideoItem,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Params = Record<string, string | number | boolean | undefined | null>;

function qs(params?: Params): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request<T>(path: string, init?: RequestInit & { params?: Params }): Promise<T> {
  const { params, ...rest } = init || {};
  const res = await fetch(path + qs(params), { credentials: 'same-origin', ...rest });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* not json */
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const get = <T>(path: string, params?: Params) => request<T>(path, { params });

// ------------------------------------------------------------------ public API

export type TrendingType = 'default' | 'music' | 'gaming' | 'movies' | 'news';

export const api = {
  trending: (type: TrendingType = 'default', region = 'US') =>
    get<VideoItem[]>('/api/v1/trending', { type: type === 'default' ? undefined : type, region }),

  popular: () => get<VideoItem[]>('/api/v1/popular'),

  search: (q: string, opts: SearchOptions = {}, page = 1) =>
    get<SearchItem[]>('/api/v1/search', { q, page, ...opts }),

  suggestions: (q: string) => get<{ query: string; suggestions: string[] }>('/api/v1/search/suggestions', { q }),

  video: (id: string) => get<VideoDetails>(`/api/v1/videos/${encodeURIComponent(id)}`, { local: true }),

  videoLite: (id: string) =>
    get<VideoItem>(`/api/v1/videos/${encodeURIComponent(id)}`, {
      fields: 'title,videoId,author,authorId,authorVerified,lengthSeconds,viewCount,published,publishedText,liveNow,authorThumbnails',
    }),

  comments: (id: string, sortBy: 'top' | 'new' = 'top', continuation?: string) =>
    get<CommentsResponse>(`/api/v1/comments/${encodeURIComponent(id)}`, { sort_by: sortBy, continuation }),

  replies: (id: string, continuation: string) =>
    get<CommentsResponse>(`/api/v1/comments/${encodeURIComponent(id)}`, { continuation }),

  channel: (ucid: string) => get<ChannelDetails>(`/api/v1/channels/${encodeURIComponent(ucid)}`),

  channelVideos: (
    ucid: string,
    tab: 'videos' | 'shorts' | 'streams' = 'videos',
    sortBy: 'newest' | 'popular' | 'oldest' = 'newest',
    continuation?: string,
  ) => get<ChannelVideosResponse>(`/api/v1/channels/${encodeURIComponent(ucid)}/${tab}`, { sort_by: sortBy, continuation }),

  channelPlaylists: (ucid: string, sortBy: 'last' | 'newest' | 'popular' = 'last', continuation?: string) =>
    get<ChannelPlaylistsResponse>(`/api/v1/channels/${encodeURIComponent(ucid)}/playlists`, { sort_by: sortBy, continuation }),

  channelCommunity: (ucid: string, continuation?: string) =>
    get<CommunityResponse>(`/api/v1/channels/${encodeURIComponent(ucid)}/community`, { continuation }),

  channelSearch: (ucid: string, q: string, page = 1) =>
    get<SearchItem[]>(`/api/v1/channels/${encodeURIComponent(ucid)}/search`, { q, page }),

  resolveUrl: (url: string) => get<{ ucid?: string; pageType?: string; params?: string }>('/api/v1/resolveurl', { url }),

  playlist: (plid: string, page = 1) => get<PlaylistDetails>(`/api/v1/playlists/${encodeURIComponent(plid)}`, { page }),

  mix: (rdid: string) => get<MixDetails>(`/api/v1/mixes/${encodeURIComponent(rdid)}`),

  hashtag: (tag: string, page = 1) => get<{ results: VideoItem[] }>(`/api/v1/hashtag/${encodeURIComponent(tag)}`, { page }),

  storyboardVtt: async (id: string, height = 90) => {
    const res = await fetch(`/api/v1/storyboards/${encodeURIComponent(id)}?height=${height}`);
    if (!res.ok) throw new ApiError('No storyboard', res.status);
    return res.text();
  },

  // ---------------------------------------------------------------- extras served by our backend
  config: () => get<{ sponsorblock: boolean; ryd: boolean; shortsCheck?: boolean }>('/x/config'),
  checkShorts: (ids: string[]) => get<{ shorts: string[]; videos: string[] }>('/x/shorts', { ids: ids.join(',') }),
  localFeed: (ids: string[], page = 1) => get<{ videos: VideoItem[]; hasMore: boolean }>('/x/feed', { ids: ids.join(','), page }),
  sponsorSegments: (id: string) => get<SponsorSegment[]>(`/x/sponsorblock/${id}`),
  ryd: (id: string) => get<{ likes?: number; dislikes?: number; rating?: number; viewCount?: number }>(`/x/ryd/${id}`),

  // ---------------------------------------------------------------- auth (Invidious account)
  me: () => get<{ loggedIn: boolean; username?: string; expired?: boolean }>('/auth/me'),
  login: (username: string, password: string) =>
    request<{ loggedIn: boolean; username: string }>('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ loggedIn: false }>('/auth/logout', { method: 'POST' }),

  authFeed: (page = 1, maxResults = 60) =>
    get<{ notifications: VideoItem[]; videos: VideoItem[] }>('/api/v1/auth/feed', { page, max_results: maxResults }),
  authNotifications: () => get<VideoItem[]>('/api/v1/auth/notifications'),
  authSubscriptions: () => get<AuthSubscription[]>('/api/v1/auth/subscriptions'),
  authSubscribe: (ucid: string) => request<void>(`/api/v1/auth/subscriptions/${encodeURIComponent(ucid)}`, { method: 'POST' }),
  authUnsubscribe: (ucid: string) => request<void>(`/api/v1/auth/subscriptions/${encodeURIComponent(ucid)}`, { method: 'DELETE' }),
  authHistory: (page = 1, maxResults = 50) => get<string[]>('/api/v1/auth/history', { page, max_results: maxResults }),
  authAddHistory: (id: string) => request<void>(`/api/v1/auth/history/${encodeURIComponent(id)}`, { method: 'POST' }),
  authDeleteHistory: (id: string) => request<void>(`/api/v1/auth/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  authClearHistory: () => request<void>('/api/v1/auth/history', { method: 'DELETE' }),
  authPlaylists: () => get<AuthPlaylist[]>('/api/v1/auth/playlists'),
  authPlaylist: (plid: string) => get<PlaylistDetails>(`/api/v1/auth/playlists/${encodeURIComponent(plid)}`),
  authCreatePlaylist: (title: string, privacy: 'public' | 'unlisted' | 'private' = 'private') =>
    request<{ title: string; playlistId: string }>('/api/v1/auth/playlists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, privacy }),
    }),
  authDeletePlaylist: (plid: string) => request<void>(`/api/v1/auth/playlists/${encodeURIComponent(plid)}`, { method: 'DELETE' }),
  authAddToPlaylist: (plid: string, videoId: string) =>
    request<{ indexId: string }>(`/api/v1/auth/playlists/${encodeURIComponent(plid)}/videos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoId }),
    }),
  authRemoveFromPlaylist: (plid: string, indexId: string) =>
    request<void>(`/api/v1/auth/playlists/${encodeURIComponent(plid)}/videos/${encodeURIComponent(indexId)}`, { method: 'DELETE' }),
};

export interface SearchOptions {
  sort?: 'relevance' | 'rating' | 'date' | 'views';
  date?: 'hour' | 'today' | 'week' | 'month' | 'year';
  duration?: 'short' | 'medium' | 'long';
  type?: 'video' | 'playlist' | 'channel' | 'movie' | 'show' | 'all';
  features?: string;
  region?: string;
}

/** DASH manifest served through invidious-companion (proxied by our backend). */
export function dashManifestUrl(videoId: string): string {
  return `/companion/api/manifest/dash/id/${encodeURIComponent(videoId)}?local=true`;
}

/** Progressive MP4 (itag 18 = 360p, 22 = 720p) via companion. */
export function progressiveUrl(videoId: string, itag = 18): string {
  return `/companion/latest_version?id=${encodeURIComponent(videoId)}&itag=${itag}&local=true`;
}

/** Turns an absolute googlevideo URL returned by the API into a companion-proxied path. */
export function localizeStreamUrl(url: string): string {
  try {
    const u = new URL(url, location.origin);
    if (u.hostname.endsWith('googlevideo.com')) {
      u.searchParams.set('host', u.hostname);
      return `/companion/videoplayback?${u.searchParams.toString()}`;
    }
    if (u.pathname.startsWith('/videoplayback')) return `/companion${u.pathname}${u.search}`;
    return u.pathname + u.search;
  } catch {
    return url;
  }
}
