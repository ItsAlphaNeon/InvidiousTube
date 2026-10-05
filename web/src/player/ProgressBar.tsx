import { memo, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { formatDuration } from '../api/format';
import type { Chapter, SponsorSegment } from '../api/types';
import { SB_CATEGORIES } from '../stores/settings';
import { chapterAt } from './chapters';
import { findCue, type StoryboardFrame } from './vtt';

interface Props {
  duration: number;
  currentTime: number;
  bufferedEnd: number;
  chapters: Chapter[];
  segments: SponsorSegment[];
  storyboard: StoryboardFrame[];
  onSeek: (t: number) => void;
  onScrub?: (t: number | null) => void;
  /** element the tooltip must stay inside of (player root) */
  boundsRef: React.RefObject<HTMLElement | null>;
}

const SB_COLORS = Object.fromEntries(SB_CATEGORIES.map((c) => [c.id, c.color]));

export const ProgressBar = memo(function ProgressBar({ duration, currentTime, bufferedEnd, chapters, segments, storyboard, onSeek, onScrub, boundsRef }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [dragT, setDragT] = useState<number | null>(null);
  const dragging = dragT !== null;

  const timeFromEvent = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return frac * duration;
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !duration) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = timeFromEvent(e.clientX);
    setDragT(t);
    onScrub?.(t);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    const t = timeFromEvent(e.clientX);
    setHoverT(t);
    if (dragging) {
      setDragT(t);
      onScrub?.(t);
    }
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const t = timeFromEvent(e.clientX);
    setDragT(null);
    onScrub?.(null);
    onSeek(t);
  };

  const shownTime = dragT ?? currentTime;
  const parts = useMemo(
    () => (chapters.length ? chapters : [{ start: 0, end: duration || 1, title: '' }]),
    [chapters, duration],
  );
  const previewT = dragT ?? hoverT;
  const hoveredChapter = previewT != null && chapters.length ? chapterAt(chapters, previewT) : undefined;

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);

  return (
    <div
      className={'ytp-progress-bar-container' + (hoverT !== null || dragging ? ' hover' : '') + (dragging ? ' dragging' : '')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => !dragging && setHoverT(null)}
      onClick={(e) => e.stopPropagation()}
      role="slider"
      aria-label="Seek slider"
      aria-valuemin={0}
      aria-valuemax={Math.floor(duration)}
      aria-valuenow={Math.floor(shownTime)}
      aria-valuetext={`${formatDuration(shownTime)} of ${formatDuration(duration)}`}
    >
      <div className="ytp-progress-bar" ref={barRef}>
        <div className="ytp-chapters-container">
          {parts.map((c, i) => {
            const len = c.end - c.start;
            const fill = (t: number) => Math.max(0, Math.min(1, (t - c.start) / len)) * 100;
            const isHovered = hoveredChapter === c;
            return (
              <div
                key={i}
                className={'ytp-chapter-hover-container' + (isHovered ? ' hovered' : '')}
                style={{ width: `${(len / (duration || 1)) * 100}%` }}
              >
                <div className="ytp-progress-list">
                  <div className="ytp-load-progress" style={{ transform: `scaleX(${fill(bufferedEnd) / 100})` }} />
                  {previewT !== null && <div className="ytp-hover-progress" style={{ transform: `scaleX(${fill(previewT) / 100})` }} />}
                  <div className="ytp-play-progress" style={{ transform: `scaleX(${fill(shownTime) / 100})` }} />
                </div>
              </div>
            );
          })}
        </div>
        {segments.length > 0 && (
          <div className="ytp-sb-segments">
            {segments
              .filter((s) => s.actionType !== 'poi')
              .map((s) => (
                <div
                  key={s.UUID}
                  className="ytp-sb-segment"
                  style={{
                    left: `${pct(s.segment[0])}%`,
                    width: `${pct(s.segment[1] - s.segment[0])}%`,
                    background: SB_COLORS[s.category] || '#00d400',
                  }}
                />
              ))}
            {segments
              .filter((s) => s.actionType === 'poi')
              .map((s) => (
                <div key={s.UUID} className="ytp-sb-poi" style={{ left: `${pct(s.segment[0])}%`, background: SB_COLORS.poi_highlight }} />
              ))}
          </div>
        )}
        <div className="ytp-scrubber-container" style={{ left: `${pct(shownTime)}%` }}>
          <div className="ytp-scrubber-button" />
        </div>
      </div>
      {previewT !== null && duration > 0 && (
        <SeekPreview t={previewT} duration={duration} storyboard={storyboard} chapter={hoveredChapter?.title} barRef={barRef} boundsRef={boundsRef} />
      )}
    </div>
  );
});

function SeekPreview({
  t,
  duration,
  storyboard,
  chapter,
  barRef,
  boundsRef,
}: {
  t: number;
  duration: number;
  storyboard: StoryboardFrame[];
  chapter?: string;
  barRef: React.RefObject<HTMLDivElement | null>;
  boundsRef: React.RefObject<HTMLElement | null>;
}) {
  const frame = storyboard.length ? findCue(storyboard, t) ?? storyboard[storyboard.length - 1] : undefined;
  const bar = barRef.current?.getBoundingClientRect();
  const bounds = boundsRef.current?.getBoundingClientRect();
  if (!bar || !bounds) return null;
  const scale = frame ? Math.max(1, Math.min(2, (bounds.width / 1280) * 1.8)) : 1;
  const w = frame ? frame.w * scale : 0;
  const h = frame ? frame.h * scale : 0;
  const boxW = Math.max(w, 60);
  const x = bar.left - bounds.left + (t / duration) * bar.width;
  const left = Math.max(12, Math.min(x - boxW / 2, bounds.width - boxW - 12)) - (bar.left - bounds.left);
  return (
    <div className="ytp-tooltip" style={{ left, width: boxW }}>
      {frame && (
        <div
          className="ytp-tooltip-bg"
          style={{
            width: w,
            height: h,
            backgroundImage: `url("${frame.url}")`,
            backgroundPosition: `-${frame.x * scale}px -${frame.y * scale}px`,
            backgroundSize: `${frame.sheetW * scale}px auto`,
          }}
        />
      )}
      {chapter && <div className="ytp-tooltip-title">{chapter}</div>}
      <div className="ytp-tooltip-text">{formatDuration(t)}</div>
    </div>
  );
}
