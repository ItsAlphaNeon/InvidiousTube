import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MIcon, type MenuIconName } from './icons';

export interface QualityOption {
  height: number;
  label: string;
  badge?: 'HD' | '4K' | '8K';
}

export interface CaptionOption {
  id: number;
  label: string;
}

interface Props {
  qualities: QualityOption[];
  quality: 'auto' | number;
  autoHeight?: number;
  onQuality: (q: 'auto' | number) => void;
  speed: number;
  onSpeed: (s: number) => void;
  captions: CaptionOption[];
  caption: number | null;
  onCaption: (id: number | null) => void;
  sleep: number | 'end' | null;
  onSleep: (m: number | 'end' | null) => void;
  ambient: boolean;
  onAmbient: (on: boolean) => void;
  loop: boolean;
  onLoop: (on: boolean) => void;
  annotationsLabel?: string;
  maxHeight: number;
}

type Page = 'main' | 'quality' | 'speed' | 'captions' | 'sleep';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP = [10, 15, 20, 30, 45, 60];

function speedLabel(s: number) {
  return s === 1 ? 'Normal' : String(s);
}

export function SettingsMenu(p: Props) {
  const [page, setPage] = useState<Page>('main');
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Animate panel size between pages, like YouTube's settings menu
  useLayoutEffect(() => {
    const inner = ref.current?.firstElementChild as HTMLElement | null;
    if (inner) setSize({ w: inner.scrollWidth, h: Math.min(inner.scrollHeight, p.maxHeight) });
  }, [page, p.qualities.length, p.captions.length, p.maxHeight]);

  const qualityLabel =
    p.quality === 'auto'
      ? `Auto${p.autoHeight ? ` (${p.autoHeight}p)` : ''}`
      : p.qualities.find((q) => q.height === p.quality)?.label ?? `${p.quality}p`;
  const currentBadge = p.qualities.find((q) => q.height === (p.quality === 'auto' ? p.autoHeight : p.quality))?.badge;
  const captionLabel = p.caption === null ? 'Off' : p.captions.find((c) => c.id === p.caption)?.label ?? 'Off';
  const sleepLabel = p.sleep === null ? 'Off' : p.sleep === 'end' ? 'End of video' : `${p.sleep} min`;

  return (
    <div
      className="ytp-settings-menu"
      ref={ref}
      style={size ? { width: size.w, height: size.h } : undefined}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="ytp-panel" key={page} style={{ maxHeight: p.maxHeight }}>
        {page === 'main' && (
          <div className="ytp-panel-menu">
            <ToggleRow icon="ambient" label="Ambient mode" on={p.ambient} onChange={p.onAmbient} />
            <ToggleRow icon="loop" label="Loop" on={p.loop} onChange={p.onLoop} />
            {p.captions.length > 0 && (
              <Row icon="subtitles" label={`Subtitles/CC (${p.captions.length})`} value={captionLabel} onClick={() => setPage('captions')} />
            )}
            <Row icon="sleep" label="Sleep timer" value={sleepLabel} onClick={() => setPage('sleep')} />
            <Row icon="speed" label="Playback speed" value={speedLabel(p.speed)} onClick={() => setPage('speed')} />
            <Row
              icon="quality"
              label="Quality"
              value={
                <>
                  {qualityLabel}
                  {currentBadge && <sup className="ytp-quality-badge">{currentBadge}</sup>}
                </>
              }
              onClick={() => setPage('quality')}
            />
          </div>
        )}
        {page === 'quality' && (
          <SubPage title="Quality" onBack={() => setPage('main')}>
            {p.qualities.map((q) => (
              <Choice key={q.height} checked={p.quality === q.height} onClick={() => (p.onQuality(q.height), setPage('main'))}>
                {q.label}
                {q.badge && <sup className="ytp-quality-badge">{q.badge}</sup>}
              </Choice>
            ))}
            <Choice checked={p.quality === 'auto'} onClick={() => (p.onQuality('auto'), setPage('main'))}>
              Auto{p.quality === 'auto' && p.autoHeight ? <span className="ytp-menu-sub"> ({p.autoHeight}p)</span> : null}
            </Choice>
          </SubPage>
        )}
        {page === 'speed' && (
          <SubPage title="Playback speed" onBack={() => setPage('main')}>
            <SpeedPanel speed={p.speed} onSpeed={p.onSpeed} />
            {SPEEDS.map((s) => (
              <Choice key={s} checked={p.speed === s} onClick={() => (p.onSpeed(s), setPage('main'))}>
                {speedLabel(s)}
              </Choice>
            ))}
          </SubPage>
        )}
        {page === 'captions' && (
          <SubPage title="Subtitles/CC" onBack={() => setPage('main')}>
            <Choice checked={p.caption === null} onClick={() => (p.onCaption(null), setPage('main'))}>
              Off
            </Choice>
            {p.captions.map((c) => (
              <Choice key={c.id} checked={p.caption === c.id} onClick={() => (p.onCaption(c.id), setPage('main'))}>
                {c.label}
              </Choice>
            ))}
          </SubPage>
        )}
        {page === 'sleep' && (
          <SubPage title="Sleep timer" onBack={() => setPage('main')}>
            <Choice checked={p.sleep === null} onClick={() => (p.onSleep(null), setPage('main'))}>
              Off
            </Choice>
            {SLEEP.map((m) => (
              <Choice key={m} checked={p.sleep === m} onClick={() => (p.onSleep(m), setPage('main'))}>
                {m} minutes
              </Choice>
            ))}
            <Choice checked={p.sleep === 'end'} onClick={() => (p.onSleep('end'), setPage('main'))}>
              End of video
            </Choice>
          </SubPage>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, value, onClick }: { icon: MenuIconName; label: string; value: ReactNode; onClick: () => void }) {
  return (
    <div className="ytp-menuitem" role="menuitem" onClick={onClick}>
      <div className="ytp-menuitem-icon">
        <MIcon name={icon} />
      </div>
      <div className="ytp-menuitem-label">{label}</div>
      <div className="ytp-menuitem-content">
        <span>{value}</span>
        <span className="ytp-menuitem-chevron">›</span>
      </div>
    </div>
  );
}

function ToggleRow({ icon, label, on, onChange }: { icon: MenuIconName; label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="ytp-menuitem" role="menuitemcheckbox" aria-checked={on} onClick={() => onChange(!on)}>
      <div className="ytp-menuitem-icon">
        <MIcon name={icon} />
      </div>
      <div className="ytp-menuitem-label">{label}</div>
      <div className="ytp-menuitem-content">
        <div className={'ytp-menuitem-toggle-checkbox' + (on ? ' on' : '')} />
      </div>
    </div>
  );
}

function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <>
      <div className="ytp-panel-header">
        <button className="ytp-panel-back-button" onClick={onBack} aria-label="Back">
          <MIcon name="back" />
        </button>
        <span className="ytp-panel-title">{title}</span>
      </div>
      <div className="ytp-panel-menu">{children}</div>
    </>
  );
}

function Choice({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <div className="ytp-menuitem ytp-menuitem-choice" role="menuitemradio" aria-checked={checked} onClick={onClick}>
      <div className="ytp-menuitem-check">{checked && <MIcon name="check" />}</div>
      <div className="ytp-menuitem-label">{children}</div>
    </div>
  );
}

/** The 2024 "custom speed" panel: big readout, slider with -/+ and preset chips. */
function SpeedPanel({ speed, onSpeed }: { speed: number; onSpeed: (s: number) => void }) {
  const clamp = (v: number) => Math.round(Math.max(0.25, Math.min(2, v)) * 20) / 20;
  return (
    <div className="ytp-speed-panel">
      <div className="ytp-speed-value">{speed.toFixed(2)}x</div>
      <div className="ytp-speed-slider-row">
        <button className="ytp-speed-step" onClick={() => onSpeed(clamp(speed - 0.05))} aria-label="Decrease speed">
          −
        </button>
        <input
          type="range"
          className="ytp-speed-slider"
          min={0.25}
          max={2}
          step={0.05}
          value={speed}
          onChange={(e) => onSpeed(clamp(Number(e.target.value)))}
          style={{ '--fill': `${((speed - 0.25) / 1.75) * 100}%` } as React.CSSProperties}
        />
        <button className="ytp-speed-step" onClick={() => onSpeed(clamp(speed + 0.05))} aria-label="Increase speed">
          +
        </button>
      </div>
      <div className="ytp-speed-chips">
        {[1, 1.25, 1.5, 1.75, 2].map((s) => (
          <button key={s} className={'ytp-speed-chip' + (speed === s ? ' active' : '')} onClick={() => onSpeed(s)}>
            {s.toFixed(s % 1 ? 2 : 1).replace(/0$/, '')}
          </button>
        ))}
      </div>
    </div>
  );
}
