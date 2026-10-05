import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PIcon } from '../player/icons';
import { PlayerSlot, useQueueNavigation } from '../player/PlayerHost';
import { usePlayerSession } from '../stores/player';
import { useSettings } from '../stores/settings';

/** The app-style miniplayer docked above the tab bar. Swipe up to expand, sideways to dismiss. */
export function MobileMiniplayer() {
  const mini = usePlayerSession((s) => s.mini);
  const videoId = usePlayerSession((s) => s.videoId);
  const video = usePlayerSession((s) => s.video);
  const paused = usePlayerSession((s) => s.paused);
  const controls = usePlayerSession((s) => s.controls);
  const playlist = usePlayerSession((s) => s.playlist);
  const close = usePlayerSession((s) => s.close);
  const navigate = useNavigate();
  const { onNext } = useQueueNavigation();
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const shortsTab = useSettings((s) => s.shortsTab);
  const { pathname } = useLocation();
  const inShorts = shortsTab && pathname.startsWith('/shorts');

  if (!mini || !videoId || inShorts) return null;
  const watchUrl = `/watch?v=${videoId}${playlist ? `&list=${playlist.id}&index=${playlist.index + 1}` : ''}`;
  const expand = () => navigate(watchUrl);
  const dismiss = () => {
    controls?.pause();
    close();
    setDx(0);
  };

  return (
    <div
      className="m-mini"
      style={dx ? { transform: `translateX(${dx}px)`, opacity: Math.max(0.2, 1 - Math.abs(dx) / 300), transition: 'none' } : undefined}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const mx = e.clientX - d.x;
        if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(e.clientY - d.y)) setDx(mx);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        const my = e.clientY - d.y;
        const mx = e.clientX - d.x;
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) expand();
        else if (Math.abs(dx) > 120) dismiss();
        else if (my < -40 && Math.abs(dx) < 20) expand();
        else setDx(0);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDx(0);
      }}
    >
      <div className="m-mini-video">
        <PlayerSlot className="m-mini-slot" />
      </div>
      <div className="m-mini-info">
        <div className="m-mini-title">{video?.title ?? 'Loading…'}</div>
        <div className="m-mini-channel">{playlist ? `${playlist.title} • ${playlist.index + 1}/${playlist.videos.length}` : video?.author}</div>
      </div>
      <button className="m-mini-btn" onClick={() => controls?.toggle()} aria-label={paused ? 'Play' : 'Pause'}>
        <PIcon name={paused ? 'play' : 'pause'} />
      </button>
      {playlist && onNext ? (
        <button className="m-mini-btn" onClick={onNext} aria-label="Next">
          <PIcon name="next" />
        </button>
      ) : (
        <button className="m-mini-btn" onClick={dismiss} aria-label="Close">
          <PIcon name="close" />
        </button>
      )}
    </div>
  );
}
