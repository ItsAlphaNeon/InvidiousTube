import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const argPort = process.argv.indexOf('--port');
const PORT = Number((argPort > -1 && process.argv[argPort + 1]) || process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const INVIDIOUS_URL = (process.env.INVIDIOUS_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const COMPANION_URL = (process.env.COMPANION_URL || 'http://127.0.0.1:8282').replace(/\/+$/, '').replace(/\/companion$/, '');
const ENABLE_SPONSORBLOCK = process.env.ENABLE_SPONSORBLOCK !== '0';
const ENABLE_RYD = process.env.ENABLE_RYD !== '0';
const ENABLE_SHORTS_CHECK = process.env.ENABLE_SHORTS_CHECK !== '0';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const EMBED_SITE_NAME = process.env.EMBED_SITE_NAME || 'YouTube';
const EMBED_VIDEO = process.env.EMBED_VIDEO !== '0';
const DIST_DIR = path.resolve(__dirname, '../../web/dist');

const SID_COOKIE = 'itube_sid';
const USER_COOKIE = 'itube_user';

// ---------------------------------------------------------------- helpers

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieAttrs(maxAgeSec, httpOnly = true) {
  return [
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'SameSite=Lax',
    httpOnly ? 'HttpOnly' : '',
    COOKIE_SECURE ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

/** Tiny TTL + size bounded cache. */
class TTLCache {
  constructor(max = 500) {
    this.max = max;
    this.map = new Map();
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }
  set(key, value, ttlMs) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { value, exp: Date.now() + ttlMs });
  }
  delete(key) {
    this.map.delete(key);
  }
}

async function fetchJson(url, init = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, headers: { 'accept-language': 'en-US,en;q=0.9', ...(init.headers || {}) }, signal: ctrl.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} for ${url}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch {
        results[i] = undefined;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------- app

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

function stripUpstreamHeaders(proxyRes) {
  delete proxyRes.headers['set-cookie'];
  delete proxyRes.headers['content-security-policy'];
  delete proxyRes.headers['x-frame-options'];
  delete proxyRes.headers['referrer-policy'];
  delete proxyRes.headers['permissions-policy'];
}

// ---------------------------------------------------------------- image cache
// Invidious re-fetches every thumbnail from YouTube (~0.5s each). Cache them in memory and let
// browsers cache them too, so grids render instantly after the first visit.

const IMAGE_CACHE_BYTES = Number(process.env.IMAGE_CACHE_MB || 256) * 1024 * 1024;
const imageCache = new Map(); // url -> { body, type, exp }
let imageCacheSize = 0;
const inflight = new Map();

function cacheImage(key, entry) {
  if (entry.body.length > 5 * 1024 * 1024) return;
  imageCache.set(key, entry);
  imageCacheSize += entry.body.length;
  while (imageCacheSize > IMAGE_CACHE_BYTES && imageCache.size) {
    const [k, v] = imageCache.entries().next().value;
    imageCache.delete(k);
    imageCacheSize -= v.body.length;
  }
}

async function fetchImage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${INVIDIOUS_URL}${url}`, { signal: ctrl.signal });
    const body = Buffer.from(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get('content-type') || 'image/jpeg', body };
  } finally {
    clearTimeout(t);
  }
}

app.get(/^\/(vi|ggpht|sb|s_p)\//, async (req, res) => {
  const key = req.originalUrl;
  const hit = imageCache.get(key);
  if (hit && hit.exp > Date.now()) {
    imageCache.delete(key);
    imageCache.set(key, hit);
    res.set({ 'content-type': hit.type, 'cache-control': 'public, max-age=86400', 'x-itube-cache': 'hit' });
    return res.status(hit.status).send(hit.body);
  }
  try {
    let p = inflight.get(key);
    if (!p) {
      p = fetchImage(key).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    const r = await p;
    if (r.status === 200) cacheImage(key, { ...r, exp: Date.now() + 6 * 60 * 60 * 1000 });
    res.set({ 'content-type': r.type, 'cache-control': r.status === 200 ? 'public, max-age=86400' : 'no-cache', 'x-itube-cache': 'miss' });
    res.status(r.status).send(r.body);
  } catch (e) {
    res.status(504).end();
  }
});

// Invidious API proxy
app.use(
  createProxyMiddleware({
    target: INVIDIOUS_URL,
    changeOrigin: true,
    pathFilter: (pathname) => /^\/(api\/v1|vi|ggpht|sb|s_p)(\/|$)/.test(pathname),
    proxyTimeout: 30000,
    on: {
      proxyReq(proxyReq, req) {
        proxyReq.removeHeader('cookie');
        proxyReq.removeHeader('origin');
        proxyReq.removeHeader('referer');
        if (req.url.startsWith('/api/v1/auth')) {
          const sid = parseCookies(req.headers.cookie)[SID_COOKIE];
          if (sid) proxyReq.setHeader('cookie', `SID=${sid}`);
        }
      },
      proxyRes(proxyRes) {
        stripUpstreamHeaders(proxyRes);
      },
      error(err, _req, res) {
        console.error('[invidious proxy]', err.message);
        if (res.writeHead && !res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
        res.end?.(JSON.stringify({ error: 'Invidious unreachable' }));
      },
    },
  }),
);

// invidious-companion: DASH manifests, latest_version, videoplayback (range streaming)
app.use(
  createProxyMiddleware({
    target: COMPANION_URL,
    changeOrigin: true,
    pathFilter: (pathname) => pathname.startsWith('/companion/'),
    proxyTimeout: 0,
    timeout: 0,
    on: {
      proxyReq(proxyReq) {
        proxyReq.removeHeader('cookie');
        proxyReq.removeHeader('origin');
        proxyReq.removeHeader('referer');
      },
      proxyRes(proxyRes) {
        stripUpstreamHeaders(proxyRes);
        // companion redirects use relative /companion/... locations, which stay on our origin.
        const loc = proxyRes.headers.location;
        if (loc && loc.startsWith(COMPANION_URL)) proxyRes.headers.location = loc.slice(COMPANION_URL.length);
      },
      error(err, _req, res) {
        console.error('[companion proxy]', err.message);
        if (res.writeHead && !res.headersSent) res.writeHead(502);
        res.end?.();
      },
    },
  }),
);

// ---------------------------------------------------------------- config

app.get('/x/config', (_req, res) => {
  res.json({ sponsorblock: ENABLE_SPONSORBLOCK, ryd: ENABLE_RYD, shortsCheck: ENABLE_SHORTS_CHECK });
});

// ---------------------------------------------------------------- auth

app.post('/auth/login', express.json(), async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Enter your username and password' });
  try {
    const r = await fetch(`${INVIDIOUS_URL}/login?referer=%2F&type=invidious`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: username, password, action: 'signin' }),
      redirect: 'manual',
    });
    const cookies = r.headers.getSetCookie?.() ?? [];
    const sidCookie = cookies.find((c) => c.startsWith('SID='));
    const sid = sidCookie?.slice(4).split(';')[0];
    if (!sid) {
      const html = await r.text().catch(() => '');
      const msg = html.match(/<div class="h-box">\s*<p>([^<]+)<\/p>/)?.[1]?.trim()
        || html.match(/<p>([^<]*(?:password|user|email|captcha)[^<]*)<\/p>/i)?.[1]?.trim();
      return res.status(401).json({ error: msg || 'Wrong username or password' });
    }
    const maxAge = 60 * 60 * 24 * 365 * 2;
    res.setHeader('Set-Cookie', [
      `${SID_COOKIE}=${encodeURIComponent(sid)}; ${cookieAttrs(maxAge)}`,
      `${USER_COOKIE}=${encodeURIComponent(username)}; ${cookieAttrs(maxAge, false)}`,
    ]);
    res.json({ loggedIn: true, username });
  } catch (e) {
    console.error('[login]', e);
    res.status(502).json({ error: 'Could not reach Invidious' });
  }
});

app.post('/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', [
    `${SID_COOKIE}=; ${cookieAttrs(0)}`,
    `${USER_COOKIE}=; ${cookieAttrs(0, false)}`,
  ]);
  res.json({ loggedIn: false });
});

app.get('/auth/me', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies[SID_COOKIE];
  if (!sid) return res.json({ loggedIn: false });
  try {
    const r = await fetch(`${INVIDIOUS_URL}/api/v1/auth/preferences`, { headers: { cookie: `SID=${sid}` } });
    if (r.ok) return res.json({ loggedIn: true, username: cookies[USER_COOKIE] || 'Invidious user' });
    if (r.status === 403 || r.status === 401) return res.json({ loggedIn: false, expired: true });
    res.status(502).json({ loggedIn: false, error: `Invidious returned ${r.status}` });
  } catch {
    res.status(502).json({ loggedIn: false, error: 'Could not reach Invidious' });
  }
});

// ---------------------------------------------------------------- subscription feed (local mode)

const channelCache = new TTLCache(2000);
const CHANNEL_TTL = 15 * 60 * 1000;

async function latestForChannel(ucid) {
  const cached = channelCache.get(ucid);
  if (cached) return cached;
  const data = await fetchJson(`${INVIDIOUS_URL}/api/v1/channels/${encodeURIComponent(ucid)}/latest`);
  const videos = Array.isArray(data) ? data : data.videos || [];
  channelCache.set(ucid, videos, CHANNEL_TTL);
  return videos;
}

app.get('/x/feed', async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[\w-]{10,40}$/.test(s))
    .slice(0, 500);
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(120, Math.max(10, Number(req.query.limit) || 60));
  if (!ids.length) return res.json({ videos: [], hasMore: false });
  const lists = await mapLimit(ids, 8, latestForChannel);
  const seen = new Set();
  const all = [];
  for (const list of lists) {
    for (const v of list || []) {
      if (!v?.videoId || seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      all.push(v);
    }
  }
  all.sort((a, b) => (b.published || 0) - (a.published || 0));
  const start = (page - 1) * perPage;
  res.json({ videos: all.slice(start, start + perPage), hasMore: start + perPage < all.length });
});

// ---------------------------------------------------------------- Shorts detection
// Invidious' feeds don't mark Shorts. YouTube answers /shorts/<id> with 200 for a Short and a
// redirect to /watch for a regular video, which is the only reliable signal. Results never change,
// so they are cached for the life of the process.

const shortsCache = new Map(); // videoId -> boolean
const SHORTS_CACHE_MAX = 100000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

async function checkShort(id) {
  if (shortsCache.has(id)) return shortsCache.get(id);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${id}`, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
      signal: ctrl.signal,
    });
    let result = null;
    if (r.status === 200) result = true;
    else if (r.status >= 300 && r.status < 400 && /\/watch\?/.test(r.headers.get('location') || '')) result = false;
    if (result !== null) {
      if (shortsCache.size >= SHORTS_CACHE_MAX) shortsCache.delete(shortsCache.keys().next().value);
      shortsCache.set(id, result);
    }
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

app.get('/x/shorts', async (req, res) => {
  if (!ENABLE_SHORTS_CHECK) return res.json({ shorts: [], videos: [] });
  const ids = [...new Set(String(req.query.ids || '').split(','))].filter((s) => /^[\w-]{11}$/.test(s)).slice(0, 50);
  const results = await mapLimit(ids, 12, checkShort);
  res.set('cache-control', 'private, max-age=86400');
  res.json({
    shorts: ids.filter((_, i) => results[i] === true),
    videos: ids.filter((_, i) => results[i] === false),
  });
});

// ---------------------------------------------------------------- SponsorBlock

const sbCache = new TTLCache(1000);
app.get('/x/sponsorblock/:videoId', async (req, res) => {
  if (!ENABLE_SPONSORBLOCK) return res.status(404).json([]);
  const { videoId } = req.params;
  if (!/^[\w-]{11}$/.test(videoId)) return res.status(400).json([]);
  const cached = sbCache.get(videoId);
  if (cached) return res.json(cached);
  // k-anonymity: only send a 4 char hash prefix to SponsorBlock
  const prefix = createHash('sha256').update(videoId).digest('hex').slice(0, 4);
  const categories = JSON.stringify([
    'sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic', 'filler', 'poi_highlight',
  ]);
  const actionTypes = JSON.stringify(['skip', 'mute', 'poi']);
  try {
    const r = await fetch(
      `https://sponsor.ajay.app/api/skipSegments/${prefix}?categories=${encodeURIComponent(categories)}&actionTypes=${encodeURIComponent(actionTypes)}`,
    );
    let segments = [];
    if (r.ok) {
      const data = await r.json();
      segments = data.find((d) => d.videoID === videoId)?.segments || [];
    }
    sbCache.set(videoId, segments, 30 * 60 * 1000);
    res.json(segments);
  } catch {
    res.json([]);
  }
});

// ---------------------------------------------------------------- Return YouTube Dislike

const rydCache = new TTLCache(1000);
app.get('/x/ryd/:videoId', async (req, res) => {
  if (!ENABLE_RYD) return res.status(404).json({});
  const { videoId } = req.params;
  if (!/^[\w-]{11}$/.test(videoId)) return res.status(400).json({});
  const cached = rydCache.get(videoId);
  if (cached) return res.json(cached);
  try {
    const data = await fetchJson(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`, {}, 8000);
    const out = { likes: data.likes, dislikes: data.dislikes, rating: data.rating, viewCount: data.viewCount };
    rydCache.set(videoId, out, 60 * 60 * 1000);
    res.json(out);
  } catch {
    res.json({});
  }
});

// ---------------------------------------------------------------- link previews (Discord & co.)
// Chat apps don't run JavaScript, so video pages get Open Graph / Twitter / oEmbed tags injected
// into index.html on the server. og:video points at a progressive MP4 (itag 18) streamed through
// companion, which Discord plays inline like a real YouTube embed; the title links to the watch page.

const VIDEO_ID = /^[\w-]{11}$/;
const PREVIEW_BOT =
  /bot\b|crawler|spider|facebookexternalhit|embedly|iframely|discord|slack|telegram|whatsapp|skype|mastodon|pleroma|misskey|synapse|bluesky|cardyb|vkshare|curl\/|wget\//i;
// Discord also unfurls links with this exact, otherwise long-dead, browser user agent
const DISCORD_FIREFOX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11.6; rv:92.0) Gecko/20100101 Firefox/92.0';

function isPreviewBot(req) {
  const ua = req.headers['user-agent'] || '';
  return PREVIEW_BOT.test(ua) || ua === DISCORD_FIREFOX_UA;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function publicOrigin(req) {
  return PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

/** The video a YouTube-shaped path points at (/watch?v=, youtu.be-style /ID, /shorts/ID, ...). */
function videoFromPath(pathname, query) {
  const parts = pathname.split('/').filter(Boolean);
  const [first = '', second = ''] = parts;
  if (first === 'watch') {
    const v = String(query.v || '') || second;
    return VIDEO_ID.test(v) ? v : null;
  }
  if (/^(?:shorts|live|embed|v|e)$/.test(first)) return VIDEO_ID.test(second) ? second : null;
  if (parts.length === 1 && VIDEO_ID.test(first)) return first;
  return null;
}

function previewDescription(text = '') {
  const s = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return s.length > 300 ? `${s.slice(0, 297).trimEnd()}…` : s;
}

/** Width x height of the embedded MP4: itag 18 when listed, else 360p in the video's aspect ratio. */
function embedVideoSize(v) {
  const sizeOf = (f) => String(f?.size || '').split('x').map(Number);
  const [w, h] = sizeOf((v.formatStreams || []).find((f) => String(f.itag) === '18'));
  if (w > 0 && h > 0) return { width: w, height: h };
  const [aw, ah] = sizeOf((v.adaptiveFormats || []).find((f) => /^video\//.test(f.type || '') && f.size));
  if (aw > 0 && ah > 0) return aw >= ah ? { width: Math.round((360 * aw) / ah), height: 360 } : { width: 360, height: Math.round((360 * ah) / aw) };
  return { width: 640, height: 360 };
}

const previewCache = new TTLCache(1000);
const previewInflight = new Map();

function loadPreview(id) {
  const cached = previewCache.get(id);
  if (cached) return Promise.resolve(cached);
  let p = previewInflight.get(id);
  if (p) return p;
  p = (async () => {
    const v = await fetchJson(`${INVIDIOUS_URL}/api/v1/videos/${id}`, {}, 10000);
    // Prefer the 1280x720 thumbnail (warming the image cache for the crawler's follow-up fetch)
    let thumb = { path: `/vi/${id}/hqdefault.jpg`, width: 480, height: 360 };
    const maxresPath = `/vi/${id}/maxresdefault.jpg`;
    const maxres = await fetchImage(maxresPath).catch(() => null);
    if (maxres?.status === 200) {
      cacheImage(maxresPath, { ...maxres, exp: Date.now() + 6 * 60 * 60 * 1000 });
      thumb = { path: maxresPath, width: 1280, height: 720 };
    }
    const preview = {
      id,
      title: v.title || 'Video',
      author: v.author || '',
      authorId: v.authorId || '',
      description: previewDescription(v.description),
      lengthSeconds: v.lengthSeconds || 0,
      thumb,
      video: EMBED_VIDEO && !v.liveNow && !v.isUpcoming ? embedVideoSize(v) : null,
    };
    previewCache.set(id, preview, 60 * 60 * 1000);
    return preview;
  })().finally(() => previewInflight.delete(id));
  previewInflight.set(id, p);
  return p;
}

function previewTags(p, req) {
  const origin = publicOrigin(req);
  const q = new URLSearchParams({ v: p.id });
  for (const k of ['t', 'list', 'index']) if (req.query[k]) q.set(k, String(req.query[k]));
  const pageUrl = `${origin}/watch?${q}`;
  const image = `${origin}${p.thumb.path}`;
  const tags = [
    ['property', 'og:site_name', EMBED_SITE_NAME],
    ['property', 'og:url', pageUrl],
    ['property', 'og:title', p.title],
    ['property', 'og:description', p.description],
    ['property', 'og:image', image],
    ['property', 'og:image:width', p.thumb.width],
    ['property', 'og:image:height', p.thumb.height],
    ['name', 'twitter:site', EMBED_SITE_NAME],
    ['name', 'twitter:title', p.title],
    ['name', 'twitter:description', p.description],
    ['name', 'twitter:image', image],
  ];
  if (p.video) {
    const src = `${origin}/x/embed/${p.id}.mp4`;
    tags.push(
      ['property', 'og:type', 'video.other'],
      ['property', 'og:video', src],
      ['property', 'og:video:url', src],
      ...(src.startsWith('https:') ? [['property', 'og:video:secure_url', src]] : []),
      ['property', 'og:video:type', 'video/mp4'],
      ['property', 'og:video:width', p.video.width],
      ['property', 'og:video:height', p.video.height],
      ['name', 'twitter:card', 'player'],
      ['name', 'twitter:player:stream', src],
      ['name', 'twitter:player:stream:content_type', 'video/mp4'],
      ['name', 'twitter:player:width', p.video.width],
      ['name', 'twitter:player:height', p.video.height],
    );
    if (p.lengthSeconds) tags.push(['property', 'video:duration', p.lengthSeconds]);
  } else {
    tags.push(['property', 'og:type', 'website'], ['name', 'twitter:card', 'summary_large_image']);
  }
  const oembed = `${origin}/x/oembed?id=${p.id}`;
  return [
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`),
    `<link rel="alternate" type="application/json+oembed" href="${escapeHtml(oembed)}" title="${escapeHtml(p.title)}" />`,
  ].join('\n    ');
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms, null))]);
}

/** index.html with preview tags for a video page, or null when the path isn't one. */
async function renderVideoIndex(req) {
  const id = videoFromPath(req.path, req.query);
  if (!id) return null;
  const bot = isPreviewBot(req);
  // Crawlers wait for the lookup; people only get tags that are already cached (no added latency)
  const p = bot ? await withTimeout(loadPreview(id).catch(() => null), 8000) : previewCache.get(id);
  if (!p) return null;
  let html = await readFile(path.join(DIST_DIR, 'index.html'), 'utf8');
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(`${p.title} - ${EMBED_SITE_NAME}`)}</title>`);
  // Discord colours the embed's side bar with theme-color; the app resets it on load for people
  if (bot) html = html.replace(/(<meta name="theme-color" content=")[^"]*/, (_m, pre) => `${pre}#ff0000`);
  return html.replace('</head>', () => `  ${previewTags(p, req)}\n  </head>`);
}

// oEmbed supplies the channel name / link shown above the title, like YouTube's own embeds
app.get('/x/oembed', async (req, res) => {
  let id = String(req.query.id || '');
  if (!VIDEO_ID.test(id)) {
    try {
      const u = new URL(String(req.query.url || ''));
      id = videoFromPath(u.pathname, Object.fromEntries(u.searchParams)) || '';
    } catch {}
  }
  if (!VIDEO_ID.test(id)) return res.status(404).json({ error: 'Not a video link' });
  const p = await loadPreview(id).catch(() => null);
  if (!p) return res.status(404).json({ error: 'Video unavailable' });
  const origin = publicOrigin(req);
  res.set('cache-control', 'public, max-age=3600');
  res.json({
    version: '1.0',
    type: 'link',
    title: p.title,
    author_name: p.author,
    author_url: p.authorId ? `${origin}/channel/${p.authorId}` : `${origin}/`,
    provider_name: EMBED_SITE_NAME,
    provider_url: `${origin}/`,
    thumbnail_url: `${origin}${p.thumb.path}`,
    thumbnail_width: p.thumb.width,
    thumbnail_height: p.thumb.height,
  });
});

// Progressive MP4 for og:video. The companion stream URL is resolved once and cached; range
// requests (seeking in Discord's player) are passed straight through.
const embedStreamCache = new TTLCache(500);

async function resolveEmbedStream(id) {
  const hit = embedStreamCache.get(id);
  if (hit) return hit;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${COMPANION_URL}/companion/latest_version?id=${id}&itag=18&local=true`, {
      redirect: 'manual',
      signal: ctrl.signal,
    });
    await r.body?.cancel();
    const loc = r.headers.get('location');
    if (r.status < 300 || r.status >= 400 || !loc) {
      const err = new Error(`companion latest_version returned ${r.status}`);
      err.status = r.status >= 400 ? r.status : 502;
      throw err;
    }
    const url = new URL(loc, `${COMPANION_URL}/companion/`).toString();
    embedStreamCache.set(id, url, 60 * 60 * 1000);
    return url;
  } finally {
    clearTimeout(t);
  }
}

app.get(/^\/x\/embed\/([\w-]{11})\.mp4$/, async (req, res) => {
  if (!EMBED_VIDEO) return res.status(404).end();
  const id = req.params[0];
  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  const headers = req.headers.range ? { range: req.headers.range } : {};
  try {
    let upstream;
    for (let attempt = 0; ; attempt++) {
      upstream = await fetch(await resolveEmbedStream(id), { headers, signal: ctrl.signal });
      if (upstream.ok || upstream.status === 416 || attempt) break;
      // stream URLs expire: resolve a fresh one and try again once
      await upstream.body?.cancel();
      embedStreamCache.delete(id);
    }
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return res.status(upstream.status === 416 ? 416 : 502).end();
    }
    res.status(upstream.status);
    for (const h of ['content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('content-type', 'video/mp4');
    res.setHeader('cache-control', 'public, max-age=3600');
    if (req.method === 'HEAD' || !upstream.body) {
      await upstream.body?.cancel();
      return res.end();
    }
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (e) {
    if (ctrl.signal.aborted) return;
    console.error('[embed video]', e.message);
    if (!res.headersSent) res.status(e.status === 404 ? 404 : 502).end();
    else res.destroy();
  }
});

// ---------------------------------------------------------------- static SPA

if (existsSync(DIST_DIR)) {
  app.use(
    '/assets',
    express.static(path.join(DIST_DIR, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
  );
  app.use(
    express.static(DIST_DIR, {
      index: false,
      maxAge: '1h',
      // the service worker and manifest must update promptly after a deploy
      setHeaders: (res, file) => /(?:sw\.js|\.webmanifest)$/.test(file) && res.setHeader('Cache-Control', 'no-cache'),
    }),
  );
  app.get('*', async (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/x/') || req.path.startsWith('/auth/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    try {
      const html = await renderVideoIndex(req);
      if (html) return res.vary('User-Agent').type('html').send(html);
    } catch (e) {
      console.error('[link preview]', e.message);
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) =>
    res.type('text').send('InvidiousTube server is running. Build the frontend with `npm run build` (or use `npm run dev`).'),
  );
}

app.listen(PORT, HOST, () => {
  console.log(`InvidiousTube listening on http://${HOST}:${PORT}`);
  console.log(`  Invidious: ${INVIDIOUS_URL}`);
  console.log(`  Companion: ${COMPANION_URL}/companion`);
  console.log(`  SponsorBlock: ${ENABLE_SPONSORBLOCK ? 'on' : 'off'}, RYD: ${ENABLE_RYD ? 'on' : 'off'}`);
});
