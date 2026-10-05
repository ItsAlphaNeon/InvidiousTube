import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../../api/format';
import { progressiveUrl } from '../../api/invidious';
import { videoThumb, type ThumbQuality } from '../../api/images';
import { Icon } from '../../icons';
import { useWatchProgress } from '../../stores/library';
import { useSettings } from '../../stores/settings';

interface Props {
  videoId: string;
  lengthSeconds?: number;
  liveNow?: boolean;
  upcoming?: boolean;
  quality?: ThumbQuality;
  preview?: boolean;
  /** Override (e.g. "Now playing") */
  overlayText?: string;
  className?: string;
}

const FALLBACK: Record<ThumbQuality, ThumbQuality> = {
  maxresdefault: 'hqdefault',
  hq720: 'hqdefault',
  sddefault: 'hqdefault',
  hqdefault: 'mqdefault',
  mqdefault: 'default',
  default: 'default',
};

export function Thumbnail({ videoId, lengthSeconds, liveNow, upcoming, quality = 'hq720', preview, overlayText, className }: Props) {
  const [q, setQ] = useState<ThumbQuality>(quality);
  const progress = useWatchProgress(videoId, lengthSeconds);
  const hoverEnabled = useSettings((s) => s.hoverPreview) && preview && !upcoming;
  const [hovering, setHovering] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const timer = useRef<number>();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => setQ(quality), [videoId, quality]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onEnter = () => {
    if (!hoverEnabled) return;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHovering(true), 900);
  };
  const onLeave = () => {
    clearTimeout(timer.current);
    setHovering(false);
    setPlaying(false);
    setRemaining(null);
  };

  return (
    <div className={'thumb' + (className ? ' ' + className : '') + (playing ? ' previewing' : '')} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <img
        className="thumb-img"
        src={videoThumb(videoId, q)}
        alt=""
        loading="lazy"
        onLoad={(e) => {
          // i.ytimg serves a 120x90 grey placeholder for missing qualities
          const img = e.currentTarget;
          if (img.naturalWidth === 120 && q !== 'default') setQ(FALLBACK[q]);
        }}
        onError={() => q !== 'default' && setQ(FALLBACK[q])}
      />
      {hovering && (
        <video
          ref={videoRef}
          className="thumb-preview"
          src={progressiveUrl(videoId)}
          muted
          autoPlay
          playsInline
          onPlaying={() => setPlaying(true)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setRemaining(v.duration - v.currentTime);
          }}
        />
      )}
      {overlayText ? (
        <div className="thumb-overlay-now">{overlayText}</div>
      ) : liveNow ? (
        <div className="thumb-badge live">
          <Icon name="live" size={14} />
          LIVE
        </div>
      ) : upcoming ? (
        <div className="thumb-badge">UPCOMING</div>
      ) : lengthSeconds ? (
        <div className="thumb-badge">{formatDuration(playing && remaining != null ? remaining : lengthSeconds)}</div>
      ) : null}
      {progress > 0 && !playing && (
        <div className="thumb-progress">
          <div style={{ width: `${Math.max(progress * 100, 3)}%` }} />
        </div>
      )}
      {hovering && !playing && hoverEnabled && <div className="thumb-hover-hint">Keep hovering to play</div>}
    </div>
  );
}
