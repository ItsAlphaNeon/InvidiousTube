/**
 * Maps any YouTube URL (or just its path + query) to the equivalent route in this app, so a link
 * like https://www.youtube.com/watch?v=… or https://youtu.be/… works by swapping the domain.
 */

const YT_HOSTS = /^(?:(?:www|m|music|gaming)\.)?youtube(?:-nocookie)?\.com$|^youtu\.be$/i;
const VIDEO_ID = /^[\w-]{11}$/;

/** Builds a /watch URL, carrying over start time and playlist context. */
function watchPath(id: string, q: URLSearchParams): string {
  const out = new URLSearchParams({ v: id });
  const t = q.get('t') ?? q.get('start') ?? q.get('time_continue');
  if (t) out.set('t', t);
  const list = q.get('list');
  if (list) out.set('list', list);
  const index = q.get('index');
  if (list && index) out.set('index', index);
  return `/watch?${out.toString()}`;
}

/** Returns true if the string is an absolute YouTube URL. */
export function isYouTubeUrl(input: string): boolean {
  try {
    return YT_HOSTS.test(new URL(input.trim()).hostname);
  } catch {
    return false;
  }
}

/**
 * Resolves a YouTube URL or path to an in-app path. Returns null when the link has no equivalent
 * (e.g. clips or community posts) or isn't a YouTube link at all.
 */
export function resolveYouTubeUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim(), 'https://www.youtube.com');
  } catch {
    return null;
  }
  if (!YT_HOSTS.test(u.hostname) && u.origin !== location.origin) return null;
  const q = u.searchParams;
  const parts = u.pathname.split('/').filter(Boolean);
  const [first = '', second = '', third = ''] = parts;

  // youtu.be/ID
  if (u.hostname.toLowerCase() === 'youtu.be') return VIDEO_ID.test(first) ? watchPath(first, q) : null;

  switch (first.toLowerCase()) {
    case '':
      return '/';
    case 'watch': {
      const v = q.get('v') || (VIDEO_ID.test(second) ? second : '');
      return v ? watchPath(v, q) : null;
    }
    case 'shorts':
    case 'live':
    case 'embed':
    case 'v':
    case 'e':
      if (first === 'embed' && second === 'videoseries' && q.get('list')) return `/playlist?list=${encodeURIComponent(q.get('list')!)}`;
      return VIDEO_ID.test(second) ? watchPath(second, q) : null;
    case 'attribution_link': {
      const inner = q.get('u');
      return inner ? resolveYouTubeUrl(inner) : null;
    }
    case 'playlist': {
      const list = q.get('list');
      return list ? `/playlist?list=${encodeURIComponent(list)}` : null;
    }
    case 'results':
    case 'search': {
      const sq = q.get('search_query') ?? q.get('q');
      return sq ? `/results?search_query=${encodeURIComponent(sq)}` : '/';
    }
    case 'channel':
    case 'c':
    case 'user': {
      if (!second) return null;
      const tab = channelTab(third);
      return `/${first.toLowerCase()}/${second}${tab ? `/${tab}` : ''}`;
    }
    case 'hashtag':
      return second ? `/hashtag/${second}` : null;
    case 'feed':
      return second === 'library' || second === 'you' ? '/feed/you' : `/feed/${second || 'subscriptions'}`;
    case 'playlists':
      return '/feed/playlists';
  }

  if (first.startsWith('@')) {
    const tab = channelTab(second);
    return `/${first}${tab ? `/${tab}` : ''}`;
  }
  if (VIDEO_ID.test(first) && parts.length === 1) return watchPath(first, q);
  return null;
}

/** Normalizes YouTube channel tab names to the ones this app supports. */
function channelTab(tab: string): string {
  switch (tab.toLowerCase()) {
    case 'videos':
    case 'shorts':
    case 'streams':
    case 'playlists':
    case 'community':
      return tab.toLowerCase();
    case 'live':
      return 'streams';
    case 'posts':
      return 'community';
    default:
      return ''; // featured, about, store, …
  }
}
