/** YouTube style compact number: 999, 1.2K, 12K, 823K, 1.2M, 12M, 1.8B (truncated, not rounded). */
export function compactNumber(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '0';
  const abs = Math.abs(n);
  const fmt = (v: number, suffix: string) => {
    if (v < 10) {
      const t = Math.floor(v * 10) / 10;
      return (t % 1 === 0 ? t.toFixed(0) : t.toFixed(1)) + suffix;
    }
    return Math.floor(v) + suffix;
  };
  if (abs < 1000) return String(n);
  if (abs < 1e6) return fmt(abs / 1e3, 'K');
  if (abs < 1e9) return fmt(abs / 1e6, 'M');
  return fmt(abs / 1e9, 'B');
}

export function fullNumber(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('en-US');
}

export function viewsText(n?: number, fallback?: string): string {
  if (n == null || isNaN(n)) {
    if (!fallback) return '';
    return /view/i.test(fallback) ? fallback : `${fallback} views`;
  }
  if (n === 0) return 'No views';
  if (n === 1) return '1 view';
  return `${compactNumber(n)} views`;
}

export function subsText(n?: number, fallback?: string): string {
  if (n == null || isNaN(n) || n < 0) return fallback ? `${fallback} subscribers` : '';
  if (n === 1) return '1 subscriber';
  return `${compactNumber(n)} subscribers`;
}

export function formatDuration(totalSeconds: number | undefined): string {
  if (totalSeconds == null || isNaN(totalSeconds) || totalSeconds < 0) return '0:00';
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Long form duration used by accessibility labels, e.g. "3 minutes, 33 seconds". */
export function durationLabel(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const parts: string[] = [];
  if (h) parts.push(`${h} hour${h > 1 ? 's' : ''}`);
  if (m) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
  if (s || !parts.length) parts.push(`${s} second${s !== 1 ? 's' : ''}`);
  return parts.join(', ');
}

/** "3 days ago" from a unix timestamp (seconds). */
export function timeAgo(unixSeconds?: number, fallback?: string): string {
  if (!unixSeconds) return fallback || '';
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 0) return fallback || 'Just now';
  const units: [number, string][] = [
    [60 * 60 * 24 * 365, 'year'],
    [60 * 60 * 24 * 30, 'month'],
    [60 * 60 * 24 * 7, 'week'],
    [60 * 60 * 24, 'day'],
    [60 * 60, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ];
  for (const [secs, name] of units) {
    const v = Math.floor(diff / secs);
    if (v >= 1) return `${v} ${name}${v > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Parses "1:02:03" / "12:34" into seconds. */
export function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** Parses a ?t= value like "90", "1m30s", "1h2m3s". */
export function parseStartTime(t?: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!m) return 0;
  return (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0');
}

export function pluralize(n: number, word: string, plural = word + 's'): string {
  return `${fullNumber(n)} ${n === 1 ? word : plural}`;
}

/** Deterministic avatar fallback colour (YouTube uses a set of flat colours for letter avatars). */
const AVATAR_COLORS = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00897b', '#43a047', '#f4511e', '#6d4c41', '#546e7a', '#ef6c00', '#c2185b'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
