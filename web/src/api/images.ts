import type { Thumbnail } from './types';

/** Rewrites Google image hosts to the Invidious image proxies served by our backend. */
export function proxyImage(url?: string | null): string {
  if (!url) return '';
  let u = url.trim();
  if (u.startsWith('//')) u = 'https:' + u;
  const m = u.match(/^https?:\/\/([^/]+)(\/.*)$/);
  if (!m) return u; // already relative
  const [, host, rest] = m;
  if (host === 'yt3.ggpht.com' || host === 'yt3.googleusercontent.com' || host.endsWith('.ggpht.com')) {
    return '/ggpht' + rest;
  }
  if (/^i\d?\.ytimg\.com$/.test(host)) {
    if (rest.startsWith('/vi/') || rest.startsWith('/vi_webp/')) return rest.replace('/vi_webp/', '/vi/').replace(/\.webp(\?|$)/, '.jpg$1');
    if (rest.startsWith('/s_p/')) return rest;
    if (rest.startsWith('/sb/')) return '/sb/i' + rest.slice(3);
  }
  // Any other absolute URL pointing at an Invidious instance (e.g. /vi/ under the instance domain)
  const local = rest.match(/^\/(vi|ggpht|sb|s_p)\//);
  if (local) return rest;
  return u;
}

/** Picks the best avatar for the requested CSS size and rewrites the `=sNN` size parameter for crispness. */
export function avatarUrl(thumbs: Thumbnail[] | string | undefined, size = 48): string {
  let url: string | undefined;
  if (typeof thumbs === 'string') url = thumbs;
  else if (thumbs?.length) {
    const sorted = [...thumbs].sort((a, b) => a.width - b.width);
    url = (sorted.find((t) => t.width >= size * 2) || sorted[sorted.length - 1]).url;
  }
  if (!url) return '';
  const px = Math.min(900, Math.round(size * 2));
  url = url.replace(/=s\d+(-|$)/, `=s${px}$1`);
  return proxyImage(url);
}

export type ThumbQuality = 'maxresdefault' | 'hq720' | 'sddefault' | 'hqdefault' | 'mqdefault' | 'default';

export function videoThumb(videoId: string, quality: ThumbQuality = 'hqdefault'): string {
  return `/vi/${videoId}/${quality}.jpg`;
}

export function bannerUrl(thumbs?: Thumbnail[], width = 2120): string {
  if (!thumbs?.length) return '';
  const best = [...thumbs].sort((a, b) => b.width - a.width)[0];
  return proxyImage(best.url.replace(/=w\d+-/, `=w${width}-`));
}

export function playlistThumb(url?: string): string {
  if (!url) return '';
  return proxyImage(url);
}
