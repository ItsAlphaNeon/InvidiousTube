import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { formatDuration } from '../api/format';
import { videoThumb } from '../api/images';
import type { Chapter, SponsorSegment } from '../api/types';
import type { CardVideo } from '../components/cards/model';
import { Sheet } from '../mobile/Sheet';
import { MIcon, PIcon, type MenuIconName, type PlayerIconName } from './icons';
import { ProgressBar } from './ProgressBar';
import type { QualityOption } from './SettingsMenu';
import type { StoryboardFrame } from './vtt';

export interface MobileChromeProps {
  rootRef: React.RefObject<HTMLDivElement | null>;
  title?: string;
  show: boolean;
  setShow: (show: boolean) => void;
  paused: boolean;
  ended: boolean;
  waiting: boolean;
  time: number;
  duration: number;
  bufferedEnd: number;
  isLive: boolean;
  chapters: Chapter[];
  currentChapter?: Chapter;
  segments: SponsorSegment[];
  storyboard: StoryboardFrame[];
  fullscreen: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onSeekBy: (secs: number) => void;
  onScrub: (t: number | null) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasNext: boolean;
  onMinimize: () => void;
  onFullscreen: (on: boolean) => void;
  captions: { id: number; label: string }[];
  caption: number | null;
  onCaption: (id: number | null) => void;
  onToggleCaptions: () => void;
  qualities: QualityOption[];
  quality: 'auto' | number;
  autoHeight?: number;
  onQuality: (q: 'auto' | number) => void;
  speed: number;
  onSpeed: (s: number) => void;
  loop: boolean;
  onLoop: (on: boolean) => void;
  sleep: number | 'end' | null;
  onSleep: (s: number | 'end' | null) => void;
  autoplayNext: boolean;
  onAutoplayNext: (on: boolean) => void;
  inPlaylist: boolean;
  upNext: CardVideo | null;
  showUpNext: boolean;
  onCancelUpNext: () => void;
  onStats: () => void;
  onSheetChange: (open: boolean) => void;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP: { v: number | 'end' | null; label: string }[] = [
  { v: null, label: 'Off' },
  { v: 10, label: '10 minutes' },
  { v: 15, label: '15 minutes' },
  { v: 30, label: '30 minutes' },
  { v: 45, label: '45 minutes' },
  { v: 60, label: '60 minutes' },
  { v: 'end', label: 'End of video' },
];

type SheetView = null | 'main' | 'quality' | 'speed' | 'captions' | 'sleep';

/**
 * Touch controls in the style of the YouTube app: tap to show/hide, double-tap the sides to seek,
 * hold for 2x speed, swipe down to minimize (or leave full screen) and swipe up for full screen.
 */
export function MobileChrome(p: MobileChromeProps) {
  const [seekFx, setSeekFx] = useState<{ dir: 'back' | 'fwd'; secs: number; n: number } | null>(null);
  const [hold2x, setHold2x] = useState(false);
  const [sheet, setSheet] = useState<SheetView>(null);
  const gesture = useRef<{ x: number; y: number; id: number; t: number; moved: boolean } | null>(null);
  const holdTimer = useRef<number>();
  const tapTimer = useRef<number>();
  const lastTap = useRef<{ t: number; region: string; seeking: boolean }>({ t: 0, region: '', seeking: false });
  const speedBefore = useRef(1);

  useEffect(() => p.onSheetChange(sheet !== null), [sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => (clearTimeout(holdTimer.current), clearTimeout(tapTimer.current)), []);

  const seekBy = (secs: number) => {
    p.onSeekBy(secs);
    const dir = secs < 0 ? 'back' : 'fwd';
    setSeekFx((prev) => ({ dir, secs: prev && prev.dir === dir && Date.now() - prev.n < 900 ? prev.secs + Math.abs(secs) : Math.abs(secs), n: Date.now() }));
  };

  useEffect(() => {
    if (!seekFx) return;
    const t = setTimeout(() => setSeekFx(null), 800);
    return () => clearTimeout(t);
  }, [seekFx]);

  const onTap = (x: number) => {
    const w = p.rootRef.current?.clientWidth || 1;
    const region = x < w * 0.35 ? 'back' : x > w * 0.65 ? 'fwd' : 'center';
    const now = Date.now();
    const last = lastTap.current;
    const sideTap = region !== 'center' && !p.isLive;
    // Keep seeking with every further tap while the ripple is up
    if (sideTap && last.seeking && last.region === region && now - last.t < 800) {
      lastTap.current = { t: now, region, seeking: true };
      seekBy(region === 'back' ? -10 : 10);
      return;
    }
    if (sideTap && last.region === region && now - last.t < 300) {
      clearTimeout(tapTimer.current);
      lastTap.current = { t: now, region, seeking: true };
      seekBy(region === 'back' ? -10 : 10);
      return;
    }
    lastTap.current = { t: now, region, seeking: false };
    clearTimeout(tapTimer.current);
    const single = () => p.setShow(!p.show);
    if (region === 'center') single();
    else tapTimer.current = window.setTimeout(single, 280);
  };

  const gestureProps = {
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      if (!e.isPrimary) return;
      gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId, t: Date.now(), moved: false };
      clearTimeout(holdTimer.current);
      if (!p.paused && !p.isLive) {
        holdTimer.current = window.setTimeout(() => {
          speedBefore.current = p.speed;
          p.onSpeed(2);
          setHold2x(true);
          p.setShow(false);
        }, 550);
      }
    },
    onPointerMove: (e: RPointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 12) {
        g.moved = true;
        clearTimeout(holdTimer.current);
      }
    },
    onPointerUp: (e: RPointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      gesture.current = null;
      clearTimeout(holdTimer.current);
      if (!g || g.id !== e.pointerId) return;
      if (hold2x) {
        p.onSpeed(speedBefore.current);
        setHold2x(false);
        return;
      }
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        if (dy > 0) {
          if (p.fullscreen) p.onFullscreen(false);
          else p.onMinimize();
        } else if (!p.fullscreen) p.onFullscreen(true);
        return;
      }
      if (g.moved) return;
      const r = p.rootRef.current!.getBoundingClientRect();
      onTap(e.clientX - r.left);
    },
    onPointerCancel: () => {
      gesture.current = null;
      clearTimeout(holdTimer.current);
      if (hold2x) {
        p.onSpeed(speedBefore.current);
        setHold2x(false);
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const stop = { onPointerDown: (e: RPointerEvent) => e.stopPropagation(), onPointerUp: (e: RPointerEvent) => e.stopPropagation() };
  const btn = (icon: PlayerIconName, label: string, onClick: () => void, className = '') => (
    <button
      className={'mp-btn ' + className}
      aria-label={label}
      {...stop}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
        p.setShow(true);
      }}
    >
      <PIcon name={icon} />
    </button>
  );

  const show = p.show && !hold2x;
  const qualityLabel = p.quality === 'auto' ? `Auto${p.autoHeight ? ` (${p.autoHeight}p)` : ''}` : `${p.quality}p`;
  const sheetContainer = p.fullscreen ? p.rootRef.current : null;

  return (
    <>
      <div className="mp-gestures" {...gestureProps} />

      {seekFx && (
        <div className={'mp-seek ' + seekFx.dir} key={seekFx.dir}>
          <div className="mp-seek-arrows">
            <span />
            <span />
            <span />
          </div>
          <div className="mp-seek-text">{seekFx.secs} seconds</div>
        </div>
      )}
      {hold2x && (
        <div className="mp-2x">
          2x
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" fill="#fff" />
          </svg>
        </div>
      )}

      <div className={'mp-chrome' + (show ? ' show' : '')}>
        <div className="mp-scrim" />
        <div className="mp-top">
          {p.fullscreen ? (
            <>
              {btn('chevronDown', 'Exit full screen', () => p.onFullscreen(false), 'mp-collapse')}
              <div className="mp-title">{p.title}</div>
            </>
          ) : (
            <>
              {btn('chevronDown', 'Minimize', p.onMinimize, 'mp-collapse')}
              <div className="mp-spacer" />
            </>
          )}
          {!p.inPlaylist && (
            <button
              className="mp-btn mp-autoplay"
              aria-label={`Autoplay is ${p.autoplayNext ? 'on' : 'off'}`}
              {...stop}
              onClick={(e) => (e.stopPropagation(), p.onAutoplayNext(!p.autoplayNext))}
            >
              <span className={'mp-switch' + (p.autoplayNext ? ' on' : '')}>
                <span className="mp-switch-knob">
                  <svg viewBox="0 0 12 12" width="10" height="10">
                    {p.autoplayNext ? <path d="M3 1.5v9L10 6z" fill="#000" /> : <path d="M3 2h2v8H3zM7 2h2v8H7z" fill="#000" />}
                  </svg>
                </span>
              </span>
            </button>
          )}
          {p.captions.length > 0 &&
            btn('subtitles', 'Captions', p.onToggleCaptions, 'mp-cc' + (p.caption !== null ? ' on' : ''))}
          {btn('settings', 'Settings', () => setSheet('main'))}
        </div>

        <div className="mp-center">
          {p.onPrev ? btn('prev', 'Previous', p.onPrev, 'mp-skip') : <span className="mp-skip-placeholder" />}
          {p.waiting && !p.paused ? (
            <span className="mp-play-placeholder" />
          ) : (
            btn(p.ended ? 'replay' : p.paused ? 'play' : 'pause', p.paused ? 'Play' : 'Pause', p.onToggle, 'mp-play')
          )}
          {p.hasNext && p.onNext ? btn('next', 'Next', p.onNext, 'mp-skip') : <span className="mp-skip-placeholder" />}
        </div>

        <div className="mp-bottom">
          <div className="mp-time">
            {p.isLive ? (
              <span className="mp-live">
                <span className="mp-live-dot" />
                LIVE
              </span>
            ) : (
              <>
                <span className="mp-time-cur">{formatDuration(p.time)}</span>
                <span className="mp-time-sep"> / </span>
                <span>{formatDuration(p.duration)}</span>
              </>
            )}
            {p.currentChapter && (
              <span className="mp-chapter">
                <span className="mp-chapter-dot">•</span>
                {p.currentChapter.title}
              </span>
            )}
          </div>
          {btn(p.fullscreen ? 'exitFullscreen' : 'fullscreen', p.fullscreen ? 'Exit full screen' : 'Full screen', () => p.onFullscreen(!p.fullscreen), 'mp-fs')}
        </div>
      </div>

      {!p.isLive && (
        <div className={'mp-progress' + (show ? ' show' : '')} {...stop}>
          <ProgressBar
            duration={p.duration}
            currentTime={p.time}
            bufferedEnd={p.bufferedEnd}
            chapters={p.chapters}
            segments={p.segments}
            storyboard={p.storyboard}
            onSeek={(t) => {
              p.onSeek(t);
              p.setShow(true);
            }}
            onScrub={(t) => {
              p.onScrub(t);
              if (t !== null) p.setShow(true);
            }}
            boundsRef={p.rootRef}
          />
        </div>
      )}

      {p.showUpNext && p.upNext && <UpNext video={p.upNext} onPlay={() => p.onNext?.()} onCancel={p.onCancelUpNext} />}

      {sheet && (
        <Sheet onClose={() => setSheet(null)} container={sheetContainer} className="mp-sheet">
          {sheet === 'main' && (
            <>
              <SheetRow icon="quality" label="Quality" value={qualityLabel} onClick={() => setSheet('quality')} />
              {p.captions.length > 0 && (
                <SheetRow icon="subtitles" label="Captions" value={p.caption === null ? 'Off' : p.captions[p.caption]?.label} onClick={() => setSheet('captions')} />
              )}
              <SheetRow icon="speed" label="Playback speed" value={p.speed === 1 ? 'Normal' : `${p.speed}x`} onClick={() => setSheet('speed')} />
              <SheetRow icon="loop" label="Loop video" value={p.loop ? 'On' : 'Off'} onClick={() => (p.onLoop(!p.loop), setSheet(null))} />
              <SheetRow
                icon="sleep"
                label="Sleep timer"
                value={p.sleep === null ? 'Off' : p.sleep === 'end' ? 'End of video' : `${p.sleep} min`}
                onClick={() => setSheet('sleep')}
              />
              <SheetRow icon="info" label="Stats for nerds" onClick={() => (p.onStats(), setSheet(null))} />
            </>
          )}
          {sheet === 'quality' && (
            <SheetList
              title="Quality for current video"
              items={[{ v: 'auto' as const, label: `Auto${p.autoHeight ? ` (${p.autoHeight}p)` : ''}` }, ...p.qualities.map((q) => ({ v: q.height, label: q.label, badge: q.badge }))]}
              current={p.quality}
              onPick={(v) => (p.onQuality(v), setSheet(null))}
            />
          )}
          {sheet === 'speed' && (
            <SheetList title="Playback speed" items={SPEEDS.map((v) => ({ v, label: v === 1 ? 'Normal' : `${v}x` }))} current={p.speed} onPick={(v) => (p.onSpeed(v), setSheet(null))} />
          )}
          {sheet === 'captions' && (
            <SheetList
              title="Captions"
              items={[{ v: null as number | null, label: 'Off' }, ...p.captions.map((c) => ({ v: c.id as number | null, label: c.label }))]}
              current={p.caption}
              onPick={(v) => (p.onCaption(v), setSheet(null))}
            />
          )}
          {sheet === 'sleep' && <SheetList title="Sleep timer" items={SLEEP} current={p.sleep} onPick={(v) => (p.onSleep(v), setSheet(null))} />}
        </Sheet>
      )}
    </>
  );
}

function SheetRow({ icon, label, value, onClick }: { icon: MenuIconName; label: string; value?: ReactNode; onClick: () => void }) {
  return (
    <button className="m-sheet-row" onClick={onClick}>
      <MIcon name={icon} />
      <span className="m-sheet-row-label">{label}</span>
      {value != null && <span className="m-sheet-row-value">{value}</span>}
    </button>
  );
}

function SheetList<T>({ title, items, current, onPick }: { title: string; items: { v: T; label: string; badge?: string }[]; current: T; onPick: (v: T) => void }) {
  return (
    <>
      <div className="m-sheet-list-title">{title}</div>
      {items.map((it) => (
        <button key={String(it.v)} className={'m-sheet-row' + (it.v === current ? ' on' : '')} onClick={() => onPick(it.v)}>
          <span className="m-sheet-check">{it.v === current && <MIcon name="check" />}</span>
          <span className="m-sheet-row-label">
            {it.label}
            {it.badge && <sup className="m-sheet-badge">{it.badge}</sup>}
          </span>
        </button>
      ))}
    </>
  );
}

function UpNext({ video, onPlay, onCancel }: { video: CardVideo; onPlay: () => void; onCancel: () => void }) {
  const TOTAL = 6;
  const [left, setLeft] = useState(TOTAL);
  useEffect(() => {
    const iv = setInterval(() => setLeft((l) => l - 0.1), 100);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (left <= 0) onPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left <= 0]);
  return (
    <div className="mp-upnext" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <div className="mp-upnext-label">Up next in {Math.max(0, Math.ceil(left))}</div>
      <div className="mp-upnext-row">
        <img src={videoThumb(video.videoId, 'mqdefault')} alt="" />
        <div className="mp-upnext-meta">
          <div className="mp-upnext-title clamp-2">{video.title}</div>
          <div className="mp-upnext-author">{video.author}</div>
        </div>
      </div>
      <div className="mp-upnext-actions">
        <button className="mp-upnext-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button className="mp-upnext-play" onClick={onPlay}>
          Play now
        </button>
      </div>
    </div>
  );
}
