import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration } from '../../api/format';
import { videoThumb } from '../../api/images';
import { Icon } from '../../icons';
import { usePlayerSession, type PlaylistContext } from '../../stores/player';

export function PlaylistPanel({ playlist }: { playlist: PlaylistContext }) {
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const setPlaylist = usePlayerSession((s) => s.setPlaylist);

  useEffect(() => {
    const el = listRef.current?.querySelector('.pl-panel-item.active') as HTMLElement | null;
    if (el && listRef.current) listRef.current.scrollTop = el.offsetTop - listRef.current.offsetTop - 8;
  }, [playlist.index, collapsed]);

  const next = playlist.videos[playlist.index + 1];

  return (
    <div className={'pl-panel' + (collapsed ? ' collapsed' : '')}>
      <div className="pl-panel-header">
        <div className="pl-panel-header-text">
          <h3 className="pl-panel-title">
            <Link to={`/playlist?list=${playlist.id}`}>{playlist.title}</Link>
          </h3>
          <div className="pl-panel-sub">
            {collapsed && next ? (
              <>Next: {next.title}</>
            ) : (
              <>
                {playlist.author && <span>{playlist.author}</span>}
                {playlist.author && <span> - </span>}
                <span>
                  {playlist.index + 1}/{playlist.videos.length}
                </span>
              </>
            )}
          </div>
          {!collapsed && (
            <div className="pl-panel-actions">
              <button
                className={'icon-btn' + (playlist.loop ? ' toggled' : '')}
                data-tooltip="Loop playlist"
                onClick={() => setPlaylist({ ...playlist, loop: !playlist.loop })}
              >
                <Icon name="loop" />
              </button>
              <button
                className={'icon-btn' + (playlist.shuffle ? ' toggled' : '')}
                data-tooltip="Shuffle playlist"
                onClick={() => {
                  const cur = playlist.videos[playlist.index];
                  const rest = playlist.videos.filter((_, i) => i !== playlist.index);
                  for (let i = rest.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [rest[i], rest[j]] = [rest[j], rest[i]];
                  }
                  setPlaylist({ ...playlist, shuffle: !playlist.shuffle, videos: [cur, ...rest], index: 0 });
                }}
              >
                <Icon name="shuffle" />
              </button>
            </div>
          )}
        </div>
        <button className="icon-btn" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand' : 'Collapse'}>
          <Icon name={collapsed ? 'chevronDown' : 'close'} />
        </button>
      </div>
      {!collapsed && (
        <div className="pl-panel-list" ref={listRef}>
          {playlist.videos.map((v, i) => (
            <Link
              key={v.videoId + i}
              to={`/watch?v=${v.videoId}&list=${playlist.id}&index=${i + 1}`}
              className={'pl-panel-item' + (i === playlist.index ? ' active' : '')}
              onClick={() => setPlaylist({ ...playlist, index: i })}
            >
              <span className="pl-panel-index">{i === playlist.index ? '▶' : i + 1}</span>
              <span className="pl-panel-thumb">
                <img src={videoThumb(v.videoId, 'mqdefault')} alt="" loading="lazy" />
                {v.lengthSeconds > 0 && <span className="thumb-badge">{formatDuration(v.lengthSeconds)}</span>}
              </span>
              <span className="pl-panel-meta">
                <span className="pl-panel-item-title clamp-2">{v.title}</span>
                <span className="pl-panel-item-author">{v.author}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
