import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatDate, fullNumber, timeAgo, viewsText } from '../api/format';
import { playlistThumb, videoThumb } from '../api/images';
import { toCard } from '../components/cards/model';
import { Thumbnail } from '../components/cards/Thumbnail';
import { VideoMenu } from '../components/cards/VideoMenu';
import { MenuItem } from '../components/common/Menu';
import { ShareDialog } from '../components/common/ShareDialog';
import { Spinner } from '../components/common/Spinner';
import { usePlaylistActions } from '../hooks/useAccount';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usePlaylistData, type ResolvedPlaylist } from '../hooks/usePlaylistData';
import { Icon } from '../icons';
import { toLite, useLibrary } from '../stores/library';
import { usePlayerSession } from '../stores/player';
import { toast } from '../stores/ui';
import './playlist.css';

/** Average colour of an image, darkened, for the playlist header gradient. */
function useDominantColor(src?: string): string {
  const [color, setColor] = useState('rgb(60,60,60)');
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 8;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
        }
        const n = d.length / 4;
        const k = 0.55;
        setColor(`rgb(${Math.round((r / n) * k)},${Math.round((g / n) * k)},${Math.round((b / n) * k)})`);
      } catch {
        /* tainted */
      }
    };
    img.src = src;
  }, [src]);
  return color;
}

export function Playlist() {
  const [params] = useSearchParams();
  const list = params.get('list');
  const { data, isLoading, isError } = usePlaylistData(list);
  useDocumentTitle(data?.title);
  if (isLoading) return <Spinner />;
  if (isError || !data)
    return (
      <div className="page-empty">
        <h2>This playlist does not exist.</h2>
      </div>
    );
  return <PlaylistView pl={data} />;
}

function PlaylistView({ pl }: { pl: ResolvedPlaylist }) {
  const navigate = useNavigate();
  const [share, setShare] = useState(false);
  const firstId = pl.videos[0]?.videoId;
  const thumb = pl.thumbnail ? playlistThumb(pl.thumbnail) : firstId ? videoThumb(firstId, 'hq720') : '';
  const color = useDominantColor(firstId ? videoThumb(firstId, 'mqdefault') : undefined);
  const actions = usePlaylistActions();
  const removeWL = useLibrary((s) => s.removeWatchLater);
  const setRating = useLibrary((s) => s.setRating);

  const playAll = (shuffle = false) => {
    if (!pl.videos.length) return;
    const videos = pl.videos.map((v) => toLite(v));
    if (shuffle) {
      for (let i = videos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [videos[i], videos[j]] = [videos[j], videos[i]];
      }
      usePlayerSession.getState().setPlaylist({ id: pl.id, title: pl.title, author: pl.author, videos, index: 0, local: pl.local, loop: false, shuffle: true });
    }
    navigate(`/watch?v=${videos[0].videoId}&list=${pl.id}&index=1`);
  };

  const meta = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${fullNumber(pl.videoCount)} videos`);
    if (pl.viewCount) parts.push(`${fullNumber(pl.viewCount)} views`);
    if (pl.updated) parts.push(`Updated ${timeAgo(pl.updated)}`);
    return parts;
  }, [pl]);

  const removeFromList = (videoId: string, indexId?: string) => {
    if (pl.kind === 'watchLater') removeWL(videoId);
    else if (pl.kind === 'liked') {
      const v = pl.videos.find((x) => x.videoId === videoId);
      if (v) setRating(toLite(v), 'none');
    } else actions.remove(pl.id, pl.local, videoId, indexId);
    toast(`Removed from ${pl.title}`);
  };

  return (
    <div className="playlist-page">
      <aside className="playlist-header" style={{ '--pl-color': color } as React.CSSProperties}>
        <div className="playlist-header-bg" style={{ backgroundImage: thumb ? `url(${thumb})` : undefined }} />
        <div className="playlist-header-content">
          <button className="playlist-header-thumb" onClick={() => playAll()} disabled={!firstId}>
            {thumb ? <img src={thumb} alt="" /> : <div className="playlist-header-thumb-empty" />}
            {firstId && (
              <span className="playlist-header-thumb-hover">
                <Icon name="play" />
                PLAY ALL
              </span>
            )}
          </button>
          <h1 className="playlist-title">{pl.title}</h1>
          <div className="playlist-owner">
            {pl.authorId ? <Link to={`/channel/${pl.authorId}`}>by {pl.author}</Link> : pl.author && <span>by {pl.author}</span>}
          </div>
          <div className="playlist-meta">
            <span>Playlist</span>
            {pl.privacy && (
              <>
                <span className="dot-sep" />
                <span className="playlist-privacy">
                  <Icon name={pl.privacy === 'public' ? 'globe' : pl.privacy === 'unlisted' ? 'link' : 'lock'} size={16} />
                  {pl.privacy[0].toUpperCase() + pl.privacy.slice(1)}
                </span>
              </>
            )}
          </div>
          <div className="playlist-meta">
            {meta.map((m, i) => (
              <span key={i}>
                {i > 0 && <span className="dot-sep" />}
                {m}
              </span>
            ))}
          </div>
          <div className="playlist-icon-buttons">
            {!pl.local && (
              <button className="icon-btn playlist-round" data-tooltip="Share" onClick={() => setShare(true)}>
                <Icon name="share" />
              </button>
            )}
            {pl.owned && pl.kind !== 'watchLater' && pl.kind !== 'liked' && (
              <button
                className="icon-btn playlist-round"
                data-tooltip="Delete playlist"
                onClick={async () => {
                  if (!confirm(`Delete "${pl.title}"?`)) return;
                  await actions.destroy(pl.id, pl.local);
                  toast('Playlist deleted');
                  navigate('/feed/playlists');
                }}
              >
                <Icon name="trash" />
              </button>
            )}
          </div>
          <div className="playlist-play-buttons">
            <button className="pill-btn playlist-playall" onClick={() => playAll()} disabled={!firstId}>
              <Icon name="play" />
              Play all
            </button>
            <button className="pill-btn playlist-shuffle" onClick={() => playAll(true)} disabled={!firstId}>
              <Icon name="shuffle" />
              Shuffle
            </button>
          </div>
          {pl.description && <div className="playlist-description">{pl.description}</div>}
        </div>
      </aside>
      <div className="playlist-videos">
        {!pl.videos.length && (
          <div className="page-empty">
            <p>No videos in this playlist yet</p>
          </div>
        )}
        {pl.videos.map((v, i) => {
          const card = toCard(v);
          return (
            <div key={v.videoId + i} className="playlist-video">
              <span className="playlist-video-index">{i + 1}</span>
              <Link to={`/watch?v=${v.videoId}&list=${pl.id}&index=${i + 1}`} className="playlist-video-thumb">
                <Thumbnail videoId={v.videoId} lengthSeconds={v.lengthSeconds} quality="mqdefault" />
              </Link>
              <Link to={`/watch?v=${v.videoId}&list=${pl.id}&index=${i + 1}`} className="playlist-video-meta">
                <h3 className="playlist-video-title clamp-2">{v.title}</h3>
                <div className="card-meta-line playlist-video-sub">
                  <span>{v.author}</span>
                  {card.viewCount != null && (
                    <>
                      <span className="dot-sep" />
                      <span>{viewsText(card.viewCount)}</span>
                    </>
                  )}
                  {card.published != null && (
                    <>
                      <span className="dot-sep" />
                      <span>{pl.local ? formatDate(card.published) : timeAgo(card.published)}</span>
                    </>
                  )}
                </div>
              </Link>
              <VideoMenu
                video={card}
                className="playlist-video-menu"
                extra={
                  pl.owned
                    ? (close) => (
                        <MenuItem
                          icon="trash"
                          onClick={() => {
                            close();
                            removeFromList(v.videoId, (v as { indexId?: string }).indexId);
                          }}
                        >
                          Remove from {pl.title}
                        </MenuItem>
                      )
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
      {share && <ShareDialog playlistId={pl.id} title={pl.title} onClose={() => setShare(false)} />}
    </div>
  );
}
