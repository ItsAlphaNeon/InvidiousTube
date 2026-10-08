import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { compactNumber, parseStartTime } from '../../api/format';
import { avatarUrl } from '../../api/images';
import { api } from '../../api/invidious';
import type { VideoDetails } from '../../api/types';
import { toCard } from '../../components/cards/model';
import { CompactSkeleton, RichSkeleton, VideoCardCompact, VideoCardGrid } from '../../components/cards/VideoCards';
import { Avatar } from '../../components/common/Avatar';
import { ChipBar } from '../../components/common/ChipBar';
import { Menu, MenuItem } from '../../components/common/Menu';
import { SaveDialog } from '../../components/common/SaveDialog';
import { ShareDialog } from '../../components/common/ShareDialog';
import { SubscribeButton } from '../../components/common/SubscribeButton';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useWindowWidth } from '../../hooks/useMediaQuery';
import { usePlaylistData } from '../../hooks/usePlaylistData';
import { useShortsFilter } from '../../hooks/useShortsFilter';
import { Icon, VerifiedBadge } from '../../icons';
import { PlayerSlot, useVideoDetails } from '../../player/PlayerHost';
import { toLite, useLibrary } from '../../stores/library';
import { usePlayerSession } from '../../stores/player';
import { useSettings } from '../../stores/settings';
import { toast } from '../../stores/ui';
import { Comments } from './Comments';
import { Description } from './Description';
import { PlaylistPanel } from './PlaylistPanel';
import { WatchToolbar } from './Toolbar';
import { useToolbar } from '../../stores/toolbar';
import { watchTogether } from '../../party/PartyDialogs';
import { PartyPanel } from '../../party/PartyPanel';
import { useInParty } from '../../party/store';
import './watch.css';

/** Loads the video in the URL into the persistent player and keeps the playlist context in sync. */
export function useWatchSession() {
  const [params] = useSearchParams();
  const v = params.get('v') || '';
  const t = parseStartTime(params.get('t') ?? params.get('start'));
  const list = params.get('list');
  const indexParam = Number(params.get('index') || 0);
  const load = usePlayerSession((s) => s.load);
  const sessionVideoId = usePlayerSession((s) => s.videoId);
  const { data: video, isError, error } = useVideoDetails(v || null);

  useDocumentTitle(video?.title);

  // load the requested video into the persistent player
  useEffect(() => {
    if (v) load(v, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  useEffect(() => {
    if (v && t && sessionVideoId === v) usePlayerSession.getState().requestSeek(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // playlist context
  const playlistData = usePlaylistData(list);
  useEffect(() => {
    const s = usePlayerSession.getState();
    if (!list) {
      if (s.playlist) s.setPlaylist(null);
      return;
    }
    const pl = playlistData.data;
    if (!pl) return;
    let idx = pl.videos.findIndex((x) => x.videoId === v);
    if (indexParam > 0 && pl.videos[indexParam - 1]?.videoId === v) idx = indexParam - 1;
    const keepOrder = s.playlist?.id === pl.id && s.playlist.shuffle;
    const videos = keepOrder ? s.playlist!.videos : pl.videos.map((x) => toLite(x));
    if (keepOrder) idx = videos.findIndex((x) => x.videoId === v);
    s.setPlaylist({
      id: pl.id,
      title: pl.title,
      author: pl.author,
      videos,
      index: Math.max(0, idx),
      local: pl.local,
      loop: s.playlist?.id === pl.id ? s.playlist.loop : false,
      shuffle: keepOrder,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, playlistData.data, v]);

  return { v, list, video, isError, error };
}

export const onTimestamp = (sec: number) => usePlayerSession.getState().requestSeek(sec);

export function Watch() {
  const { list, video, isError, error } = useWatchSession();
  const session = usePlayerSession();
  const toolbarOn = useSettings((s) => s.toolbar);
  const expanded = useToolbar((s) => s.expanded) && toolbarOn;
  const theater = useSettings((s) => s.theater) || expanded;
  const width = useWindowWidth();
  const twoColumns = width >= 1017;
  const toolbar = toolbarOn && <WatchToolbar title={video?.title} />;
  const inParty = useInParty();

  const secondary = (
    <div className="watch-secondary">
      {inParty && <PartyPanel />}
      {session.playlist && list && <PlaylistPanel playlist={session.playlist} />}
      <Related video={video ?? null} />
    </div>
  );

  return (
    <div className={'watch-flexy' + (theater ? ' theater' : '') + (expanded ? ' expanded' : '')}>
      {theater && (
        <div className="watch-full-bleed">
          <div className="watch-full-bleed-player">
            <PlayerSlot className="watch-player-slot" />
          </div>
        </div>
      )}
      {theater && toolbar}
      <div className="watch-columns">
        <div className="watch-primary">
          {!theater && (
            <div className="watch-player-outer">
              <AmbientGlow />
              <div className="watch-player">
                <PlayerSlot className="watch-player-slot" />
              </div>
            </div>
          )}
          {!theater && toolbar}
          {isError ? (
            <div className="watch-error">
              <h2>Video unavailable</h2>
              <p>{(error as Error)?.message}</p>
            </div>
          ) : video ? (
            <>
              <WatchMetadata video={video} onTimestamp={onTimestamp} />
              {!twoColumns && secondary}
              <Comments videoId={video.videoId} onTimestamp={onTimestamp} />
            </>
          ) : (
            <MetadataSkeleton />
          )}
        </div>
        {twoColumns && secondary}
      </div>
    </div>
  );
}

function MetadataSkeleton() {
  return (
    <div className="watch-metadata">
      <div className="skeleton" style={{ height: 28, width: '70%', marginTop: 12 }} />
      <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
        <div className="skeleton" style={{ height: 20, width: 160 }} />
      </div>
      <div className="skeleton" style={{ height: 96, marginTop: 16, borderRadius: 12 }} />
    </div>
  );
}

/** Like/dislike state (local or account) plus Return YouTube Dislike counts. */
export function useLikes(video: VideoDetails) {
  const lite = useMemo(() => toLite(video), [video]);
  const rating = useLibrary((s) => (s.liked.some((x) => x.videoId === video.videoId) ? 'like' : s.disliked.includes(video.videoId) ? 'dislike' : 'none'));
  const setRating = useLibrary((s) => s.setRating);
  const rydEnabled = useSettings((s) => s.ryd);
  const { data: cfg } = useQuery({ queryKey: ['x-config'], queryFn: api.config, staleTime: Infinity });
  const { data: ryd } = useQuery({
    queryKey: ['ryd', video.videoId],
    queryFn: () => api.ryd(video.videoId),
    enabled: rydEnabled && cfg?.ryd !== false,
    staleTime: 60 * 60 * 1000,
  });
  const likes = (video.likeCount || ryd?.likes || 0) + (rating === 'like' ? 1 : 0);
  const dislikes = ryd?.dislikes != null ? ryd.dislikes + (rating === 'dislike' ? 1 : 0) : undefined;
  const ratio = dislikes != null && likes + dislikes > 0 ? likes / (likes + dislikes) : null;
  return { lite, rating, setRating, likes, dislikes, ratio };
}

function WatchMetadata({ video, onTimestamp }: { video: VideoDetails; onTimestamp: (t: number) => void }) {
  const { lite, rating, setRating, likes, dislikes, ratio } = useLikes(video);
  const [dialog, setDialog] = useState<'share' | 'save' | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const width = useWindowWidth();

  const inParty = useInParty();
  const avatar = avatarUrl(video.authorThumbnails, 40);
  const showSaveInline = width >= 1300 || width < 1017;

  return (
    <div className="watch-metadata">
      <h1 className="watch-title">{video.title}</h1>
      <div className="watch-top-row">
        <div className="watch-owner">
          <Link to={`/channel/${video.authorId}`} className="watch-owner-avatar">
            <Avatar src={avatar} name={video.author} size={40} />
          </Link>
          <div className="watch-owner-text">
            <Link to={`/channel/${video.authorId}`} className="watch-owner-name">
              {video.author}
              {video.authorVerified && <VerifiedBadge />}
            </Link>
            <div className="watch-owner-subs">{video.subCountText ? `${video.subCountText} subscribers` : ''}</div>
          </div>
          <SubscribeButton authorId={video.authorId} author={video.author} thumbnail={avatar} />
        </div>
        <div className="watch-actions">
          <div className="segmented-like">
            <button
              className={'pill-btn icon-leading like-btn' + (rating === 'like' ? ' on' : '')}
              onClick={() => {
                setRating(lite, rating === 'like' ? 'none' : 'like');
                if (rating !== 'like') toast('Added to Liked videos');
              }}
              data-tooltip="I like this"
            >
              <Icon name={rating === 'like' ? 'likeFilled' : 'like'} />
              {likes ? compactNumber(likes) : ''}
            </button>
            <span className="segmented-divider" />
            <button
              className={'pill-btn dislike-btn' + (dislikes != null ? ' icon-leading' : '') + (rating === 'dislike' ? ' on' : '')}
              onClick={() => setRating(lite, rating === 'dislike' ? 'none' : 'dislike')}
              data-tooltip="I dislike this"
            >
              <Icon name={rating === 'dislike' ? 'dislikeFilled' : 'dislike'} />
              {dislikes != null && compactNumber(dislikes)}
            </button>
            {ratio != null && (
              <div className="ryd-bar" data-tooltip={`${likes.toLocaleString()} / ${dislikes!.toLocaleString()} (Return YouTube Dislike)`}>
                <div style={{ width: `${ratio * 100}%` }} />
              </div>
            )}
          </div>
          <button className="pill-btn icon-leading" onClick={() => setDialog('share')}>
            <Icon name="share" />
            Share
          </button>
          <button className="pill-btn icon-leading" onClick={() => watchTogether(video.videoId)} data-tooltip={inParty ? 'Invite friends to your watch party' : 'Watch with friends in sync'}>
            <Icon name="party" />
            {inParty ? 'Invite' : 'Watch together'}
          </button>
          <a className="pill-btn icon-leading" href={`/companion/latest_version?id=${video.videoId}&itag=18&local=true`} target="_blank" rel="noreferrer" download>
            <Icon name="download" />
            Download
          </a>
          {showSaveInline && (
            <button className="pill-btn icon-leading" onClick={() => setDialog('save')}>
              <Icon name="save" />
              Save
            </button>
          )}
          <button ref={moreRef} className="pill-btn icon-only" onClick={() => setMoreOpen((o) => !o)} aria-label="More actions">
            <Icon name="moreHoriz" />
          </button>
          <Menu anchor={moreRef} open={moreOpen} onClose={() => setMoreOpen(false)} minWidth={200}>
            {!showSaveInline && (
              <MenuItem icon="save" onClick={() => (setMoreOpen(false), setDialog('save'))}>
                Save
              </MenuItem>
            )}
            <MenuItem
              icon="watchLater"
              onClick={() => {
                setMoreOpen(false);
                const added = useLibrary.getState().toggleWatchLater(lite);
                toast(added ? 'Saved to Watch later' : 'Removed from Watch later');
              }}
            >
              Watch later
            </MenuItem>
            <MenuItem icon="globe" onClick={() => (setMoreOpen(false), window.open(`https://www.youtube.com/watch?v=${video.videoId}`, '_blank', 'noreferrer'))}>
              Open on YouTube
            </MenuItem>
            <MenuItem icon="flag" onClick={() => (setMoreOpen(false), toast('Reporting is not available on Invidious'))}>
              Report
            </MenuItem>
          </Menu>
        </div>
      </div>
      <Description video={video} onTimestamp={onTimestamp} />
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

export function Related({ video, full }: { video: VideoDetails | null; full?: boolean }) {
  const [chip, setChip] = useState('all');
  const notInterested = useLibrary((s) => s.notInterested);
  useEffect(() => setChip('all'), [video?.videoId]);
  const fromChannel = useQuery({
    queryKey: ['channel-videos', video?.authorId, 'videos', 'newest'],
    queryFn: () => api.channelVideos(video!.authorId, 'videos', 'newest'),
    enabled: !!video && chip === 'channel',
    staleTime: 10 * 60 * 1000,
  });
  const recs = (video?.recommendedVideos || []).filter((r) => !notInterested.includes(r.videoId));
  const rawItems = !video
    ? []
    : chip === 'channel'
      ? (fromChannel.data?.videos || []).filter((x) => x.videoId !== video.videoId).map(toCard)
      : chip === 'related'
        ? recs.filter((r) => r.authorId !== video.authorId).map(toCard)
        : recs.map(toCard);
  const { items } = useShortsFilter(rawItems);
  if (!video) {
    return (
      <div className="watch-related">
        {Array.from({ length: 10 }, (_, i) => (full ? <RichSkeleton key={i} /> : <CompactSkeleton key={i} />))}
      </div>
    );
  }
  const chips = [
    { id: 'all', label: 'All' },
    { id: 'channel', label: `From ${video.author}` },
    { id: 'related', label: 'Related' },
  ];
  return (
    <div className="watch-related">
      <ChipBar chips={chips} active={chip} onChange={setChip} className="watch-related-chips" />
      {chip === 'channel' && fromChannel.isLoading && Array.from({ length: 8 }, (_, i) => <CompactSkeleton key={i} />)}
      {items.map((r) => (full ? <VideoCardGrid key={r.videoId} v={r} /> : <VideoCardCompact key={r.videoId} v={r} />))}
    </div>
  );
}

/** "Ambient mode": a blurred, low-res copy of the current frame glowing behind the player (dark theme). */
function AmbientGlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enabled = useSettings((s) => s.ambientMode);
  const videoEl = usePlayerSession((s) => s.videoEl);
  useEffect(() => {
    if (!enabled || !videoEl) return;
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    let last = 0;
    let raf = 0;
    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      if (ts - last < 120 || videoEl.readyState < 2) return;
      last = ts;
      try {
        ctx.globalAlpha = 0.25;
        ctx.drawImage(videoEl, 0, 0, c.width, c.height);
      } catch {
        /* ignore */
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [enabled, videoEl]);
  if (!enabled) return null;
  return <canvas ref={canvasRef} className="ambient-canvas" width={48} height={27} aria-hidden="true" />;
}
