import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { compactNumber, timeAgo } from '../api/format';
import { avatarUrl, proxyImage } from '../api/images';
import { api } from '../api/invidious';
import type { VideoDetails } from '../api/types';
import { Avatar } from '../components/common/Avatar';
import { SaveDialog } from '../components/common/SaveDialog';
import { ShareDialog } from '../components/common/ShareDialog';
import { SubscribeButton } from '../components/common/SubscribeButton';
import { Icon, VerifiedBadge } from '../icons';
import { Comments } from '../pages/watch/Comments';
import { Description } from '../pages/watch/Description';
import { PlaylistPanel } from '../pages/watch/PlaylistPanel';
import { onTimestamp, Related, useLikes, useWatchSession } from '../pages/watch/Watch';
import { PlayerSlot } from '../player/PlayerHost';
import { useLibrary } from '../stores/library';
import { usePlayerSession } from '../stores/player';
import { toast } from '../stores/ui';
import { Sheet } from './Sheet';

type Panel = null | 'description' | 'comments' | 'playlist';

/** The app's watch view: player pinned on top, details and recommendations scrolling underneath. */
export function MobileWatch() {
  const { v, list, video, isError, error } = useWatchSession();
  const playlist = usePlayerSession((s) => s.playlist);
  const [panel, setPanel] = useState<Panel>(null);

  // A new video closes any open panel and starts at the top
  useEffect(() => {
    setPanel(null);
    document.querySelector('.mw-scroll')?.scrollTo({ top: 0 });
  }, [v]);

  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  // Timestamps tapped in the description or comments seek the player
  const seekTo = (t: number) => onTimestamp(t);

  return (
    <div className="mw">
      <div className="mw-player">
        <div className="mw-player-box">
          <PlayerSlot className="mw-player-slot" />
        </div>
      </div>
      <div className="mw-body">
        <div className="mw-scroll">
          {isError ? (
            <div className="mw-error">
              <h2>Video unavailable</h2>
              <p>{(error as Error)?.message}</p>
            </div>
          ) : video ? (
            <>
              <MobileWatchMeta video={video} onOpen={setPanel} />
              {playlist && list && (
                <button className="mw-playlist-card" onClick={() => setPanel('playlist')}>
                  <Icon name="playlists" />
                  <div className="mw-playlist-text">
                    <div className="mw-playlist-title">{playlist.title}</div>
                    <div className="mw-playlist-sub">
                      {playlist.videos[playlist.index + 1] ? `Next: ${playlist.videos[playlist.index + 1].title}` : 'End of playlist'} • {playlist.index + 1}/
                      {playlist.videos.length}
                    </div>
                  </div>
                  <Icon name="chevronDown" />
                </button>
              )}
              <CommentsTeaser videoId={video.videoId} onOpen={() => setPanel('comments')} />
            </>
          ) : (
            <MetaSkeleton />
          )}
          <Related video={video ?? null} full />
        </div>

        {panel === 'description' && video && (
          <Sheet variant="panel" title="Description" onClose={() => setPanel(null)}>
            <div className="mw-desc-sheet">
              <h2 className="mw-desc-title">{video.title}</h2>
              <DescStats video={video} />
              <Description video={video} onTimestamp={seekTo} sheet />
            </div>
          </Sheet>
        )}
        {panel === 'comments' && video && (
          <Sheet variant="panel" title="Comments" onClose={() => setPanel(null)}>
            <Comments videoId={video.videoId} onTimestamp={seekTo} />
          </Sheet>
        )}
        {panel === 'playlist' && playlist && (
          <Sheet variant="panel" title="Playlist" onClose={() => setPanel(null)}>
            <PlaylistPanel playlist={playlist} />
          </Sheet>
        )}
      </div>
    </div>
  );
}

function MetaSkeleton() {
  return (
    <div className="mw-meta">
      <div className="skeleton" style={{ height: 22, width: '90%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: '50%', marginBottom: 20 }} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
        <div className="skeleton" style={{ height: 16, width: 140 }} />
      </div>
    </div>
  );
}

function DescStats({ video }: { video: VideoDetails }) {
  const { likes } = useLikes(video);
  const date = new Date(video.published * 1000);
  return (
    <div className="mw-desc-stats">
      <div>
        <strong>{compactNumber(likes)}</strong>
        <span>Likes</span>
      </div>
      <div>
        <strong>{video.viewCount.toLocaleString()}</strong>
        <span>Views</span>
      </div>
      <div>
        <strong>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong>
        <span>{date.getFullYear()}</span>
      </div>
    </div>
  );
}

function MobileWatchMeta({ video, onOpen }: { video: VideoDetails; onOpen: (p: Panel) => void }) {
  const { lite, rating, setRating, likes, dislikes } = useLikes(video);
  const [dialog, setDialog] = useState<'share' | 'save' | null>(null);
  const inWL = useLibrary((s) => s.watchLater.some((x) => x.videoId === video.videoId));
  const avatar = avatarUrl(video.authorThumbnails, 36);
  const tags = (video.description.match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 2);

  return (
    <div className="mw-meta">
      <button className="mw-title-btn" onClick={() => onOpen('description')}>
        <h1 className="mw-title">{video.title}</h1>
        <div className="mw-subline">
          <span>{video.liveNow ? `${compactNumber(video.viewCount)} watching` : `${compactNumber(video.viewCount)} views`}</span>
          <span>{timeAgo(video.published, video.publishedText)}</span>
          {tags.map((t) => (
            <span key={t} className="mw-tag">
              {t}
            </span>
          ))}
          <span className="mw-more">...more</span>
        </div>
      </button>

      <div className="mw-owner">
        <Link to={`/channel/${video.authorId}`} className="mw-owner-link">
          <Avatar src={avatar} name={video.author} size={36} />
          <span className="mw-owner-name">
            {video.author}
            {video.authorVerified && <VerifiedBadge />}
          </span>
          <span className="mw-owner-subs">{video.subCountText}</span>
        </Link>
        <SubscribeButton authorId={video.authorId} author={video.author} thumbnail={avatar} size="sm" />
      </div>

      <div className="mw-actions">
        <div className="mw-like-pill">
          <button
            className={'mw-pill' + (rating === 'like' ? ' on' : '')}
            onClick={() => {
              setRating(lite, rating === 'like' ? 'none' : 'like');
              if (rating !== 'like') toast('Added to Liked videos');
            }}
          >
            <Icon name={rating === 'like' ? 'likeFilled' : 'like'} />
            {likes ? compactNumber(likes) : 'Like'}
          </button>
          <span className="mw-like-divider" />
          <button className={'mw-pill' + (rating === 'dislike' ? ' on' : '')} onClick={() => setRating(lite, rating === 'dislike' ? 'none' : 'dislike')}>
            <Icon name={rating === 'dislike' ? 'dislikeFilled' : 'dislike'} />
            {dislikes != null && compactNumber(dislikes)}
          </button>
        </div>
        <button className="mw-pill" onClick={() => setDialog('share')}>
          <Icon name="share" />
          Share
        </button>
        <button className="mw-pill" onClick={() => setDialog('save')}>
          <Icon name="save" />
          Save
        </button>
        <button
          className="mw-pill"
          onClick={() => {
            const added = useLibrary.getState().toggleWatchLater(lite);
            toast(added ? 'Saved to Watch later' : 'Removed from Watch later');
          }}
        >
          <Icon name="watchLater" />
          {inWL ? 'Saved' : 'Watch later'}
        </button>
        <a className="mw-pill" href={`/companion/latest_version?id=${video.videoId}&itag=18&local=true`} target="_blank" rel="noreferrer" download>
          <Icon name="download" />
          Download
        </a>
        <button className="mw-pill" onClick={() => window.open(`https://www.youtube.com/watch?v=${video.videoId}`, '_blank', 'noreferrer')}>
          <Icon name="globe" />
          YouTube
        </button>
      </div>

      {dialog === 'share' && (
        <ShareDialog
          videoId={video.videoId}
          title={video.title}
          currentTime={usePlayerSession.getState().controls?.getTime() ?? 0}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'save' && <SaveDialog video={lite} onClose={() => setDialog(null)} />}
    </div>
  );
}

function CommentsTeaser({ videoId, onOpen }: { videoId: string; onOpen: () => void }) {
  // Same query as the full comments list, so opening it is instant
  const q = useInfiniteQuery({
    queryKey: ['comments', videoId, 'top'],
    queryFn: ({ pageParam }) => api.comments(videoId, 'top', pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last) => last.continuation || undefined,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  if (q.isError) return <div className="mw-comments-teaser disabled">Comments are turned off</div>;
  const first = q.data?.pages[0];
  const top = first?.comments[0];
  const thumb = top ? proxyImage(top.authorThumbnails?.[top.authorThumbnails.length - 1]?.url || top.authorThumbnail) : undefined;
  return (
    <button className="mw-comments-teaser" onClick={onOpen}>
      <div className="mw-comments-head">
        Comments <span>{first?.commentCount != null ? compactNumber(first.commentCount) : ''}</span>
      </div>
      {top ? (
        <div className="mw-comments-top">
          <Avatar src={thumb} name={top.author} size={24} />
          <span className="clamp-2">{top.content}</span>
        </div>
      ) : (
        <div className="mw-comments-top">
          <div className="skeleton" style={{ height: 14, width: '80%' }} />
        </div>
      )}
    </button>
  );
}
