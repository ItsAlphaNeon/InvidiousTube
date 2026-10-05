import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration, viewsText } from '../api/format';
import { videoThumb } from '../api/images';
import type { CardVideo } from '../components/cards/model';
import type { EngineStats } from './engine';
import { PIcon, type PlayerIconName } from './icons';

export interface BezelState {
  icon: PlayerIconName | null;
  text?: string;
  n: number;
}

/** The round icon that pops in the centre of the player on play/pause/volume changes. */
export function Bezel({ state }: { state: BezelState }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 500);
    return () => clearTimeout(t);
  }, [state.n]);
  return (
    <>
      {state.text && visible && <div className="ytp-bezel-text-wrapper"><div className="ytp-bezel-text">{state.text}</div></div>}
      {state.icon && visible && (
        <div className="ytp-bezel" key={state.n}>
          <div className="ytp-bezel-icon">
            <PIcon name={state.icon} />
          </div>
        </div>
      )}
    </>
  );
}

/** Side ripple with arrows and "10 seconds" when seeking with j/l or the arrow keys. */
export function SeekOverlay({ dir, secs }: { dir: 'back' | 'fwd'; secs: number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 650);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div className={'ytp-seek-overlay ' + dir}>
      <div className="ytp-seek-overlay-ripple" />
      <div className="ytp-seek-overlay-content">
        <div className="ytp-seek-arrows">
          <span />
          <span />
          <span />
        </div>
        <div className="ytp-seek-text">{secs} seconds</div>
      </div>
    </div>
  );
}

export function LargePlayButton({ onClick, thumb }: { onClick: () => void; thumb: string }) {
  return (
    <div className="ytp-cued-overlay" onClick={onClick}>
      <img className="ytp-cued-thumbnail" src={thumb} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
      <button className="ytp-large-play-button" aria-label="Play">
        <svg viewBox="0 0 68 48" width="68" height="48">
          <path
            className="ytp-large-play-button-bg"
            d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z"
          />
          <path d="M 45,24 27,14 27,34" fill="#fff" />
        </svg>
      </button>
    </div>
  );
}

export function SponsorSkipButton({ label, onClick, raised }: { label: string; onClick: () => void; raised: boolean }) {
  return (
    <button
      className={'ytp-skip-button' + (raised ? ' raised' : '')}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {label}
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M5,18l10-6L5,6V18L5,18z M19,6h-2v12h2V6z" fill="#fff" />
      </svg>
    </button>
  );
}

/** "Up next" card with circular countdown shown at the end of a video when autoplay is on. */
export function AutoplayCountdown({ next, onCancel, onPlay }: { next: CardVideo; onCancel: () => void; onPlay: () => void }) {
  const TOTAL = 8;
  const [left, setLeft] = useState(TOTAL);
  useEffect(() => {
    const iv = setInterval(() => setLeft((l) => l - 0.1), 100);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (left <= 0) onPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left <= 0]);
  const circ = 2 * Math.PI * 30;
  return (
    <div className="ytp-autonav-endscreen" onClick={(e) => e.stopPropagation()}>
      <div className="ytp-autonav-endscreen-upnext-header">
        Up next in <span>{Math.max(0, Math.ceil(left))}</span>
      </div>
      <div className="ytp-autonav-endscreen-upnext-container">
        <button className="ytp-autonav-endscreen-upnext-thumbnail" onClick={onPlay} style={{ backgroundImage: `url(${videoThumb(next.videoId, 'hqdefault')})` }}>
          <span className="ytp-autonav-timestamp">{formatDuration(next.lengthSeconds)}</span>
        </button>
        <div className="ytp-autonav-endscreen-video-info">
          <div className="ytp-autonav-endscreen-upnext-title">{next.title}</div>
          <div className="ytp-autonav-endscreen-upnext-author">{next.author}</div>
          <div className="ytp-autonav-endscreen-upnext-author">{viewsText(next.viewCount, next.viewCountText)}</div>
        </div>
      </div>
      <div className="ytp-autonav-endscreen-button-container">
        <button className="ytp-autonav-endscreen-upnext-cancel-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="ytp-autonav-endscreen-upnext-play-button" onClick={onPlay}>
          <svg viewBox="0 0 72 72" width="64" height="64" className="ytp-autonav-endscreen-upnext-play-button-icon">
            <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="4" />
            <circle
              cx="36"
              cy="36"
              r="30"
              fill="none"
              stroke="#fff"
              strokeWidth="4"
              strokeDasharray={circ}
              strokeDashoffset={circ * (left / TOTAL)}
              transform="rotate(-90 36 36)"
            />
            <path d="M 30,24 48,36 30,48 z" fill="#fff" />
          </svg>
          Play Now
        </button>
      </div>
    </div>
  );
}

export function EndScreen({ videos, onReplay }: { videos: CardVideo[]; onReplay: () => void }) {
  return (
    <div className="ytp-endscreen-content" onClick={(e) => e.stopPropagation()}>
      <div className="ytp-endscreen-grid">
        {videos.slice(0, 8).map((v) => (
          <Link key={v.videoId} to={`/watch?v=${v.videoId}`} className="ytp-videowall-still" style={{ backgroundImage: `url(${videoThumb(v.videoId, 'mqdefault')})` }}>
            <div className="ytp-videowall-still-info">
              <div className="ytp-videowall-still-info-title">{v.title}</div>
              <div className="ytp-videowall-still-info-author">
                {v.author} • {viewsText(v.viewCount, v.viewCountText)}
              </div>
              <div className="ytp-videowall-still-info-duration">{formatDuration(v.lengthSeconds)}</div>
            </div>
          </Link>
        ))}
      </div>
      <button className="ytp-endscreen-replay" onClick={onReplay} aria-label="Replay">
        <PIcon name="replay" />
      </button>
    </div>
  );
}

export function StatsForNerds({
  videoId,
  stats,
  volume,
  muted,
  onClose,
}: {
  videoId: string;
  stats: EngineStats | null;
  volume: number;
  muted: boolean;
  onClose: () => void;
}) {
  const kbps = (b: number) => (b ? `${Math.round(b / 1000).toLocaleString()} Kbps` : 'n/a');
  return (
    <div className="html5-video-info-panel" onClick={(e) => e.stopPropagation()}>
      <button className="html5-video-info-panel-close" onClick={onClose} aria-label="Close">
        [x]
      </button>
      <div className="html5-video-info-panel-content">
        <div>
          <span>Video ID / sCPN</span>
          <span>{videoId} / itube</span>
        </div>
        <div>
          <span>Viewport / Frames</span>
          <span>
            {Math.round(window.innerWidth)}x{Math.round(window.innerHeight)}*{window.devicePixelRatio} / {stats?.droppedFrames ?? 0} dropped of {stats?.decodedFrames ?? 0}
          </span>
        </div>
        <div>
          <span>Current / Optimal Res</span>
          <span>
            {stats ? `${stats.width}x${stats.height}` : '-'} / {stats ? `${stats.width}x${stats.height}` : '-'}
          </span>
        </div>
        <div>
          <span>Volume / Normalized</span>
          <span>{muted ? 0 : Math.round(volume * 100)}% / {muted ? 0 : Math.round(volume * 100)}%</span>
        </div>
        <div>
          <span>Codecs</span>
          <span>
            {stats?.videoCodec || '-'} / {stats?.audioCodec || '-'}
          </span>
        </div>
        <div>
          <span>Connection Speed</span>
          <span>{kbps(stats?.estimatedBandwidth ?? 0)}</span>
        </div>
        <div>
          <span>Stream bandwidth</span>
          <span>{kbps(stats?.streamBandwidth ?? 0)}</span>
        </div>
        <div>
          <span>Buffer Health</span>
          <span>{(stats?.bufferAhead ?? 0).toFixed(2)} s</span>
        </div>
        <div>
          <span>Delivery</span>
          <span>{stats?.mode === 'progressive' ? 'Progressive (itag 18) via companion' : 'DASH via invidious-companion'}</span>
        </div>
      </div>
    </div>
  );
}
