export interface Cue {
  start: number;
  end: number;
  text: string;
}

function parseTime(ts: string): number {
  const m = ts.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/);
  if (!m) return 0;
  return (parseInt(m[1] || '0') * 3600) + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4].padEnd(3, '0')) / 1000;
}

/** Minimal WebVTT parser (enough for YouTube captions and Invidious storyboards). */
export function parseVtt(src: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = src.replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const text = lines.slice(i + 1).join('\n').trim();
    cues.push({ start: parseTime(a), end: parseTime(b.trim().split(/\s+/)[0]), text });
  }
  return cues;
}

/** Strip VTT inline tags (<c>, <00:00:01.000>, <i>, …) for display. */
export function cueText(text: string): string {
  return text
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/** YouTube auto-captions use rolling cues that repeat the previous line; collapse them. */
export function normalizeAutoCaptions(cues: Cue[]): Cue[] {
  const out: Cue[] = [];
  for (const c of cues) {
    const lines = cueText(c.text)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    // Skip the 10ms "transition" cues that only contain the previous line
    if (c.end - c.start < 0.05) continue;
    out.push({ start: c.start, end: c.end, text: lines.join('\n') });
  }
  return out;
}

export interface StoryboardFrame {
  start: number;
  end: number;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** full width of the sprite sheet the frame lives on */
  sheetW: number;
}

export function parseStoryboard(src: string): StoryboardFrame[] {
  const frames = parseVtt(src)
    .map((c) => {
      const [url, frag] = c.text.trim().split('#xywh=');
      const [x, y, w, h] = (frag || '0,0,0,0').split(',').map(Number);
      return { start: c.start, end: c.end, url, x, y, w, h, sheetW: 0 };
    })
    .filter((f) => f.url && f.w > 0);
  let sheetW = 0;
  for (const f of frames) sheetW = Math.max(sheetW, f.x + f.w);
  for (const f of frames) f.sheetW = sheetW;
  return frames;
}

export function findCue<T extends { start: number; end: number }>(cues: T[], t: number): T | undefined {
  // binary search on start
  let lo = 0;
  let hi = cues.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (best < 0) return undefined;
  const c = cues[best];
  return t < c.end ? c : undefined;
}
