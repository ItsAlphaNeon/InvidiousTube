import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { formatDuration, parseTimestamp } from '../../api/format';
import { useClickOutside } from '../../hooks/useClickOutside';
import { Icon } from '../../icons';
import { usePlayerSession } from '../../stores/player';
import { DEFAULT_FILTERS, filterCss, useToolbar, type VideoFilters } from '../../stores/toolbar';
import { toast } from '../../stores/ui';
import './toolbar.css';

/* ------------------------------------------------------------------ icons (24px line style) */

const TOOL_ICONS = {
  loop: 'M4 12V9a3 3 0 0 1 3-3h12M16 3l3 3-3 3M20 12v3a3 3 0 0 1-3 3H5M8 21l-3-3 3-3',
  booster: 'M3 9.5v5h3.5L11 19V5L6.5 9.5H3zM17.5 4 14.5 12h4l-3 8',
  cinema: 'M3 10h18v10H3zM3 10l1.4-5.5 16.8 0L19.8 10M8.5 4.5 7 10M13.5 4.5 12 10M18.5 4.5 17 10',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  popup: 'M3 5h18v14H3zM12.5 11.5h6v5h-6z',
  speed: 'M4 17a8 8 0 1 1 16 0M12 17l4.5-5.5',
  filters: 'M3 5h18v14H3zM12 8.2l1.1 2.7 2.7 1.1-2.7 1.1L12 15.8l-1.1-2.7L8.2 12l2.7-1.1z',
  screenshot: 'M3 8h4.2l1.8-3h6l1.8 3H21v11H3zM12 9.8a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 1 0 0-6.6z',
  caret: 'M8 10l4 4 4-4',
} as const;

function TIcon({ name }: { name: keyof typeof TOOL_ICONS }) {
  return (
    <svg className="tb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={TOOL_ICONS[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ volume booster (Web Audio) */

const audioGraphs = new WeakMap<HTMLVideoElement, { ctx: AudioContext; gain: GainNode }>();

function boostGraph(el: HTMLVideoElement) {
  let g = audioGraphs.get(el);
  if (!g) {
    // Once routed through Web Audio the element stays routed, so this happens only on first use
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    src.connect(gain).connect(ctx.destination);
    g = { ctx, gain };
    audioGraphs.set(el, g);
  }
  if (g.ctx.state === 'suspended') g.ctx.resume().catch(() => undefined);
  return g;
}

/* ------------------------------------------------------------------ A-B loop (per video, not persisted) */

interface AbLoop {
  a: number;
  b: number;
  on: boolean;
}
let abLoop: AbLoop | null = null;
const abListeners = new Set<() => void>();
function setAbLoop(v: AbLoop | null) {
  abLoop = v;
  abListeners.forEach((f) => f());
}
function useAbLoop(): AbLoop | null {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    abListeners.add(f);
    return () => void abListeners.delete(f);
  }, []);
  return abLoop;
}

/**
 * Applies the toolbar's lasting effects to the video element (filters, rotation, volume boost, A-B
 * loop). Mounted app-wide so they keep working in the miniplayer.
 */
export function ToolbarEffects() {
  const videoEl = usePlayerSession((s) => s.videoEl);
  const videoId = usePlayerSession((s) => s.videoId);
  const { filtersOn, filters, boost, boostLevel } = useToolbar();
  const mini = usePlayerSession((s) => s.mini);

  // A-B loop belongs to one video
  useEffect(() => setAbLoop(null), [videoId]);

  // filters + rotation/flip
  useEffect(() => {
    if (!videoEl) return;
    const apply = () => {
      if (!filtersOn) {
        videoEl.style.filter = '';
        videoEl.style.transform = '';
        return;
      }
      videoEl.style.filter = filterCss(filters);
      const box = videoEl.parentElement;
      const sideways = filters.rotate === 90 || filters.rotate === 270;
      const scale = sideways && box ? Math.min(box.clientWidth / box.clientHeight, box.clientHeight / box.clientWidth) : 1;
      const t = [
        filters.rotate && `rotate(${filters.rotate}deg)`,
        scale !== 1 && `scale(${scale})`,
        filters.flipH && 'scaleX(-1)',
        filters.flipV && 'scaleY(-1)',
      ].filter(Boolean);
      videoEl.style.transform = t.join(' ');
    };
    apply();
    const ro = new ResizeObserver(apply);
    if (videoEl.parentElement) ro.observe(videoEl.parentElement);
    return () => {
      ro.disconnect();
      // re-applied immediately on the next run; stays cleared if the toolbar gets turned off
      videoEl.style.filter = '';
      videoEl.style.transform = '';
    };
  }, [videoEl, filtersOn, filters, mini]);

  // volume booster
  useEffect(() => {
    if (!videoEl) return;
    if (boost) {
      const g = boostGraph(videoEl);
      g.gain.gain.value = boostLevel;
      // A context created without a user gesture starts suspended: resume on the next play
      const resume = () => g.ctx.state === 'suspended' && g.ctx.resume().catch(() => undefined);
      videoEl.addEventListener('play', resume);
      document.addEventListener('pointerdown', resume, { once: true });
      return () => {
        videoEl.removeEventListener('play', resume);
        document.removeEventListener('pointerdown', resume);
        g.gain.gain.value = 1;
      };
    }
    const g = audioGraphs.get(videoEl);
    if (g) g.gain.gain.value = 1;
  }, [videoEl, boost, boostLevel]);

  // A-B loop
  useEffect(() => {
    if (!videoEl) return;
    const onTime = () => {
      const l = abLoop;
      if (l?.on && l.b > l.a && (videoEl.currentTime >= l.b || videoEl.currentTime < l.a - 1)) videoEl.currentTime = l.a;
    };
    videoEl.addEventListener('timeupdate', onTime);
    return () => videoEl.removeEventListener('timeupdate', onTime);
  }, [videoEl]);

  return null;
}

/* ------------------------------------------------------------------ toolbar UI */

function ToolButton({
  icon,
  label,
  on,
  onClick,
  onContextMenu,
  children,
}: {
  icon?: keyof typeof TOOL_ICONS;
  label: string;
  on?: boolean;
  onClick?: () => void;
  onContextMenu?: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      className={'tb-btn' + (on ? ' on' : '')}
      onClick={onClick}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              onContextMenu();
            }
          : undefined
      }
      data-tooltip={label}
      aria-label={label}
      aria-pressed={on}
    >
      {icon && <TIcon name={icon} />}
      {children}
    </button>
  );
}

function Popover({ anchor, onClose, children, className }: { anchor: React.RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside([ref, anchor], onClose);
  return (
    <div ref={ref} className={'tb-popover' + (className ? ' ' + className : '')}>
      {children}
    </div>
  );
}

/** Enhancer-style utility bar shown under the player (Settings > Playback > Utility toolbar). */
export function WatchToolbar({ title }: { title?: string }) {
  const tb = useToolbar();
  const videoEl = usePlayerSession((s) => s.videoEl);
  const loop = usePlayerSession((s) => s.loop);
  const setLoop = usePlayerSession((s) => s.setLoop);
  const ab = useAbLoop();
  const [panel, setPanel] = useState<null | 'loop' | 'filters'>(null);
  const [speed, setSpeed] = useState(1);
  const [pip, setPip] = useState(false);
  const loopRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLButtonElement>(null);

  // follow the real playback rate / PiP state
  useEffect(() => {
    if (!videoEl) return;
    const onRate = () => setSpeed(videoEl.playbackRate);
    const onPip = () => setPip(document.pictureInPictureElement === videoEl);
    onRate();
    onPip();
    videoEl.addEventListener('ratechange', onRate);
    videoEl.addEventListener('enterpictureinpicture', onPip);
    videoEl.addEventListener('leavepictureinpicture', onPip);
    return () => {
      videoEl.removeEventListener('ratechange', onRate);
      videoEl.removeEventListener('enterpictureinpicture', onPip);
      videoEl.removeEventListener('leavepictureinpicture', onPip);
    };
  }, [videoEl]);

  const changeSpeed = (delta: number) => {
    if (!videoEl) return;
    videoEl.playbackRate = Math.round(Math.max(0.1, Math.min(4, videoEl.playbackRate + delta)) * 100) / 100;
  };
  // mouse wheel over the speed readout (needs a non-passive listener to stop the page scrolling)
  useEffect(() => {
    const el = speedRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      changeSpeed(e.deltaY < 0 ? 0.05 : -0.05);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl]);

  // cinema mode backdrop / html class
  useEffect(() => {
    document.documentElement.classList.toggle('cinema-mode', tb.cinema);
    return () => document.documentElement.classList.remove('cinema-mode');
  }, [tb.cinema]);

  const togglePip = async () => {
    if (!videoEl) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await videoEl.requestPictureInPicture();
    } catch {
      toast('Picture-in-Picture is not available in this browser');
    }
  };

  const screenshot = () => {
    if (!videoEl || !videoEl.videoWidth) return toast('Nothing to capture yet');
    const c = document.createElement('canvas');
    c.width = videoEl.videoWidth;
    c.height = videoEl.videoHeight;
    const ctx = c.getContext('2d')!;
    if (tb.filtersOn) ctx.filter = filterCss(tb.filters) || 'none';
    ctx.drawImage(videoEl, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return toast("Couldn't capture this frame");
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const name = (title || 'screenshot').replace(/[\\/:*?"<>|]+/g, '').slice(0, 80);
      a.download = `${name} - ${formatDuration(videoEl.currentTime).replace(/:/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  };

  const abActive = !!ab?.on;
  return (
    <>
      {tb.cinema && createPortal(<div className="cinema-backdrop" onClick={() => tb.set({ cinema: false })} />, document.body)}
      <div className="watch-toolbar" role="toolbar" aria-label="Video tools">
        <div className="tb-group" ref={loopRef}>
          <ToolButton
            icon="loop"
            label={abActive ? 'A-B loop on (right-click to edit)' : 'Loop (right-click for A-B loop)'}
            on={loop || abActive}
            onClick={() => {
              if (abActive) setAbLoop({ ...ab!, on: false });
              else setLoop(!loop);
            }}
            onContextMenu={() => setPanel(panel === 'loop' ? null : 'loop')}
          />
          {panel === 'loop' && (
            <Popover anchor={loopRef} onClose={() => setPanel(null)}>
              <AbLoopPanel />
            </Popover>
          )}
        </div>
        <ToolButton
          icon="booster"
          label={tb.boost ? `Volume boost ${tb.boostLevel}x (click to turn off)` : `Boost volume ${tb.boostLevel}x`}
          on={tb.boost}
          onClick={() => {
            if (videoEl && !tb.boost) boostGraph(videoEl);
            tb.set({ boost: !tb.boost });
          }}
        />
        <ToolButton icon="cinema" label="Cinema mode" on={tb.cinema} onClick={() => tb.set({ cinema: !tb.cinema })} />
        <ToolButton icon="expand" label={tb.expanded ? 'Shrink player' : 'Expand player'} on={tb.expanded} onClick={() => tb.set({ expanded: !tb.expanded })} />
        <ToolButton icon="popup" label="Pop-up player (Picture-in-Picture)" on={pip} onClick={togglePip} />
        <span className="tb-divider" />
        <ToolButton label="Slower" onClick={() => changeSpeed(-0.25)}>
          <span className="tb-text">−</span>
        </ToolButton>
        <button ref={speedRef} className={'tb-btn tb-speed' + (speed !== 1 ? ' on' : '')} onClick={() => videoEl && (videoEl.playbackRate = 1)} data-tooltip="Speed (scroll to adjust, click to reset)">
          <TIcon name="speed" />
          <span className="tb-speed-value">{speed.toFixed(2).replace(/\.?0+$/, '')}x</span>
        </button>
        <ToolButton label="Faster" onClick={() => changeSpeed(0.25)}>
          <span className="tb-text">+</span>
        </ToolButton>
        <span className="tb-divider" />
        <div className="tb-group" ref={filtersRef}>
          <ToolButton
            icon="filters"
            label="Video filters (right-click to adjust)"
            on={tb.filtersOn}
            onClick={() => tb.set({ filtersOn: !tb.filtersOn })}
            onContextMenu={() => setPanel(panel === 'filters' ? null : 'filters')}
          />
          <button className="tb-caret" onClick={() => setPanel(panel === 'filters' ? null : 'filters')} aria-label="Adjust video filters">
            <TIcon name="caret" />
          </button>
          {panel === 'filters' && (
            <Popover anchor={filtersRef} onClose={() => setPanel(null)} className="tb-filters-pop">
              <FiltersPanel />
            </Popover>
          )}
        </div>
        <ToolButton icon="screenshot" label="Screenshot" onClick={screenshot} />
        <Link to="/settings#playback" className="tb-btn" data-tooltip="Toolbar settings" aria-label="Toolbar settings">
          <Icon name="settings" />
        </Link>
      </div>
    </>
  );
}

function AbLoopPanel() {
  const videoEl = usePlayerSession((s) => s.videoEl);
  const ab = useAbLoop();
  const dur = videoEl?.duration && isFinite(videoEl.duration) ? videoEl.duration : 0;
  const cur = ab ?? { a: 0, b: dur, on: false };
  const [aText, setAText] = useState(formatDuration(cur.a));
  const [bText, setBText] = useState(formatDuration(cur.b));
  const update = (patch: Partial<AbLoop>) => {
    const next = { ...cur, ...patch };
    setAbLoop(next);
    if (patch.a != null) setAText(formatDuration(next.a));
    if (patch.b != null) setBText(formatDuration(next.b));
  };
  const now = () => videoEl?.currentTime ?? 0;
  return (
    <div className="tb-ab">
      <div className="tb-pop-title">A-B loop</div>
      <label className="tb-ab-row">
        <span>Start</span>
        <input value={aText} onChange={(e) => setAText(e.target.value)} onBlur={() => update({ a: parseTimestamp(aText) || 0 })} />
        <button className="pill-btn sm" onClick={() => update({ a: now() })}>
          Now
        </button>
      </label>
      <label className="tb-ab-row">
        <span>End</span>
        <input value={bText} onChange={(e) => setBText(e.target.value)} onBlur={() => update({ b: parseTimestamp(bText) || dur })} />
        <button className="pill-btn sm" onClick={() => update({ b: now() })}>
          Now
        </button>
      </label>
      <div className="tb-ab-actions">
        <button className="pill-btn sm" onClick={() => setAbLoop(null)}>
          Clear
        </button>
        <button
          className={'pill-btn sm ' + (cur.on ? 'outline' : 'filled')}
          onClick={() => {
            if (!cur.on && cur.b <= cur.a) return toast('End must be after start');
            update({ on: !cur.on });
            if (!cur.on && videoEl && (videoEl.currentTime < cur.a || videoEl.currentTime > cur.b)) videoEl.currentTime = cur.a;
          }}
        >
          {cur.on ? 'Stop loop' : 'Loop section'}
        </button>
      </div>
    </div>
  );
}

const SLIDERS: { key: keyof VideoFilters; label: string; min: number; max: number; unit: string }[] = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 200, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 0, max: 200, unit: '%' },
  { key: 'saturate', label: 'Saturation', min: 0, max: 300, unit: '%' },
  { key: 'hue', label: 'Hue', min: -180, max: 180, unit: '°' },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, unit: '%' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, unit: '%' },
  { key: 'invert', label: 'Invert', min: 0, max: 100, unit: '%' },
  { key: 'blur', label: 'Blur', min: 0, max: 10, unit: 'px' },
];

function FiltersPanel() {
  const filters = useToolbar((s) => s.filters);
  const filtersOn = useToolbar((s) => s.filtersOn);
  const setFilter = useToolbar((s) => s.setFilter);
  const set = useToolbar((s) => s.set);
  return (
    <div className="tb-filters">
      <div className="tb-pop-title">
        Video filters
        <label className="tb-filters-enable">
          <input type="checkbox" checked={filtersOn} onChange={(e) => set({ filtersOn: e.target.checked })} />
          On
        </label>
      </div>
      {SLIDERS.map((s) => (
        <label key={s.key} className="tb-slider">
          <span>{s.label}</span>
          <input type="range" min={s.min} max={s.max} value={filters[s.key] as number} onChange={(e) => setFilter(s.key, Number(e.target.value) as never)} />
          <span className="tb-slider-value">
            {filters[s.key] as number}
            {s.unit}
          </span>
        </label>
      ))}
      <div className="tb-transform">
        <span>Rotate</span>
        {([0, 90, 180, 270] as const).map((r) => (
          <button key={r} className={'chip' + (filters.rotate === r ? ' active' : '')} onClick={() => setFilter('rotate', r)}>
            {r}°
          </button>
        ))}
      </div>
      <div className="tb-transform">
        <span>Flip</span>
        <button className={'chip' + (filters.flipH ? ' active' : '')} onClick={() => setFilter('flipH', !filters.flipH)}>
          Horizontal
        </button>
        <button className={'chip' + (filters.flipV ? ' active' : '')} onClick={() => setFilter('flipV', !filters.flipV)}>
          Vertical
        </button>
      </div>
      <div className="tb-ab-actions">
        <button className="pill-btn sm" onClick={() => set({ filters: DEFAULT_FILTERS })}>
          Reset
        </button>
      </div>
    </div>
  );
}
