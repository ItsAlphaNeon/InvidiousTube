import { Link, useNavigate } from 'react-router-dom';
import { usePlayerSession } from '../stores/player';
import { PIcon } from './icons';
import { PlayerSlot, useQueueNavigation } from './PlayerHost';
import './miniplayer.css';

export function Miniplayer() {
  const mini = usePlayerSession((s) => s.mini);
  const videoId = usePlayerSession((s) => s.videoId);
  const video = usePlayerSession((s) => s.video);
  const paused = usePlayerSession((s) => s.paused);
  const controls = usePlayerSession((s) => s.controls);
  const playlist = usePlayerSession((s) => s.playlist);
  const close = usePlayerSession((s) => s.close);
  const navigate = useNavigate();
  const { onNext, onPrev } = useQueueNavigation();

  if (!mini || !videoId) return null;
  const watchUrl = `/watch?v=${videoId}${playlist ? `&list=${playlist.id}&index=${playlist.index + 1}` : ''}`;
  const expand = () => {
    const t = Math.floor(controls?.getTime() ?? 0);
    usePlayerSession.setState({ startAt: t });
    navigate(watchUrl);
  };

  return (
    <div className="miniplayer">
      <div className="miniplayer-video">
        <PlayerSlot className="miniplayer-slot" />
        <div className="miniplayer-controls" onClick={() => controls?.toggle()}>
          <button className="miniplayer-btn miniplayer-expand" onClick={(e) => (e.stopPropagation(), expand())} data-tooltip="Expand (i)" aria-label="Expand">
            <PIcon name="expand" />
          </button>
          <button
            className="miniplayer-btn miniplayer-close"
            onClick={(e) => {
              e.stopPropagation();
              controls?.pause();
              close();
            }}
            data-tooltip="Close"
            aria-label="Close"
          >
            <PIcon name="close" />
          </button>
          <div className="miniplayer-center">
            <button className="miniplayer-btn" disabled={!onPrev} onClick={(e) => (e.stopPropagation(), onPrev?.())} aria-label="Previous">
              <PIcon name="prev" />
            </button>
            <button className="miniplayer-btn miniplayer-play" onClick={(e) => (e.stopPropagation(), controls?.toggle())} aria-label={paused ? 'Play' : 'Pause'}>
              <PIcon name={paused ? 'play' : 'pause'} />
            </button>
            <button className="miniplayer-btn" disabled={!onNext} onClick={(e) => (e.stopPropagation(), onNext?.())} aria-label="Next">
              <PIcon name="next" />
            </button>
          </div>
        </div>
      </div>
      <div className="miniplayer-info">
        <Link to={watchUrl} className="miniplayer-title" onClick={(e) => (e.preventDefault(), expand())}>
          {video?.title ?? 'Loading…'}
        </Link>
        <div className="miniplayer-channel">
          {playlist ? (
            <>
              {playlist.title} • {playlist.index + 1}/{playlist.videos.length}
            </>
          ) : (
            video?.author
          )}
        </div>
      </div>
    </div>
  );
}
