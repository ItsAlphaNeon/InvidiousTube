import type { Chapter } from '../api/types';
import { parseTimestamp } from '../api/format';

/**
 * Extracts chapters from a video description the same way YouTube does:
 * timestamps at the start (or end) of lines, the first at 0:00, at least three, ascending, each ≥ 10s.
 */
export function parseChapters(description: string, duration: number): Chapter[] {
  if (!description) return [];
  const lines = description.split(/\r?\n/);
  const found: { start: number; title: string }[] = [];
  const re = /^\s*(?:[-–•*▶►]\s*)?[([]?((?:\d{1,2}:)?\d{1,2}:\d{2})[)\]]?\s*(?:[-–—:|•]\s*)?(.+?)\s*$/;
  const reEnd = /^\s*(.+?)\s*[-–—:|(]?\s*[([]?((?:\d{1,2}:)?\d{1,2}:\d{2})[)\]]?\s*$/;
  for (const line of lines) {
    let m = line.match(re);
    if (m) {
      found.push({ start: parseTimestamp(m[1]), title: m[2].replace(/^[-–—:|•\s]+/, '') });
      continue;
    }
    m = line.match(reEnd);
    if (m && /\d:\d{2}\s*[)\]]?\s*$/.test(line)) found.push({ start: parseTimestamp(m[2]), title: m[1].replace(/[-–—:|•\s]+$/, '') });
  }
  if (found.length < 3 || found[0].start !== 0) return [];
  const chapters: Chapter[] = [];
  for (let i = 0; i < found.length; i++) {
    const c = found[i];
    if (i > 0 && c.start <= found[i - 1].start) return [];
    if (duration && c.start >= duration) break;
    chapters.push({ start: c.start, end: 0, title: c.title || `Chapter ${i + 1}` });
  }
  for (let i = 0; i < chapters.length; i++) chapters[i].end = i + 1 < chapters.length ? chapters[i + 1].start : duration || chapters[i].start + 1;
  if (chapters.some((c) => c.end - c.start < 1)) return [];
  return chapters.length >= 3 ? chapters : [];
}

export function chapterAt(chapters: Chapter[], t: number): Chapter | undefined {
  for (let i = chapters.length - 1; i >= 0; i--) if (t >= chapters[i].start) return chapters[i];
  return undefined;
}
