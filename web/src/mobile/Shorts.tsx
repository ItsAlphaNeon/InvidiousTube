import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { compactNumber } from '../api/format';
import { avatarUrl, videoThumb } from '../api/images';
import { api, progressiveUrl } from '../api/invidious';
import type { VideoItem } from '../api/types';
import { Avatar } from '../components/common/Avatar';
import { SubscribeButton } from '../components/common/SubscribeButton';
import { useChannelAvatar, useSubscriptions } from '../hooks/useAccount';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Icon } from '../icons';
import { Comments } from '../pages/watch/Comments';
import { useVideoDetails } from '../player/PlayerHost';
import { PIcon } from '../player/icons';
import { useLibrary, type VideoLite } from '../stores/library';
import { usePlayerSession } from '../stores/player';
import { useSettings } from '../stores/settings';
import { toast } from '../stores/ui';
import { Sheet } from './Sheet';

interface ShortItem {
  videoId: string;
  title: string;
  author: string;
  authorId: string;
  viewCount?: number;
}

const MAX_CHANNELS = 20;
const PER_PAGE = 4;

function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const toItem = (v: VideoItem): ShortItem => ({ videoId: v.videoId, title: v.title, author: v.author, authorId: v.authorId, viewCount: v.viewCount });

/** Shorts from your subscriptions first, then Shorts from currently trending channels. */
function useShortsFeed(startId?: string) {
  const { subs } = useSubscriptions();
  const [seed] = useState(() => Date.now() % 233280);
  const channels = useMemo(() => shuffle(subs, seed).slice(0, MAX_CHANNELS), [subs, seed]);

  const fromSubs = useQueries({
    queries: channels.map((c) => ({
      queryKey: ['channel-videos', c.authorId, 'shorts', 'newest'],
      queryFn: () => api.channelVideos(c.authorId, 'shorts', 'newest'),
      staleTime: 30 * 60 * 1000,
      retry: 0,
    })),
  });

  // Discovery: Shorts tabs of channels that are trending right now (Invidious has no Shorts feed)
  const region = useSettings((st) => st.region);
  const trendingChannels = useQueries({
    queries: (['default', 'music', 'gaming'] as const).map((t) => ({
      queryKey: ['trending', t, region],
      queryFn: () => api.trending(t, region),
      staleTime: 30 * 60 * 1000,
    })),
  });
  const discoverIds = useMemo(() => {
    const subIds = new Set(channels.map((c) => c.authorId));
    const ids = interleave(trendingChannels.map((q) => (q.data || []).map((v) => v.authorId)));
    return shuffle([...new Set(ids)].filter((id) => id && !subIds.has(id)), seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendingChannels.map((q) => q.dataUpdatedAt).join(), channels, seed]);

  const discover = useInfiniteQuery({
    queryKey: ['shorts-discover', discoverIds.slice(0, 4).join()],
    enabled: discoverIds.length > 0,
    queryFn: async ({ pageParam }) => {
      const batch = discoverIds.slice((pageParam - 1) * PER_PAGE, pageParam * PER_PAGE);
      const lists = await Promise.all(
        batch.map((id) =>
          api
            .channelVideos(id, 'shorts', 'newest')
            .then((r) => r.videos.filter((v) => !v.liveNow && !v.isUpcoming).slice(0, 4))
            .catch(() => [] as VideoItem[]),
        ),
      );
      return interleave(lists);
    },
    initialPageParam: 1,
    getNextPageParam: (_last, all) => (all.length * PER_PAGE < discoverIds.length ? all.length + 1 : undefined),
    staleTime: 30 * 60 * 1000,
  });

  // Keep pulling discovery pages until there's enough to swipe through
  const found = (discover.data?.pages || []).flat().length;
  useEffect(() => {
    if (found < 10 && discover.hasNextPage && !discover.isFetching && (discover.data?.pages.length ?? 0) < 8) discover.fetchNextPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, discover.isFetching]);

  const settledSubs = fromSubs.map((q) => q.dataUpdatedAt).join();
  const items = useMemo(() => {
    const subLists = fromSubs.map((q) => (q.data?.videos || []).filter((v) => !v.liveNow && !v.isUpcoming).slice(0, 6).map(toItem));
    const found = (discover.data?.pages || []).flat().map(toItem);
    const merged = [...interleave(subLists).slice(0, 60), ...found];
    const seen = new Set<string>();
    const out: ShortItem[] = startId ? [{ videoId: startId, title: '', author: '', authorId: '' }] : [];
    if (startId) seen.add(startId);
    for (const v of merged) {
      if (!v.videoId || seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      out.push(v);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledSubs, discover.data, startId]);

  const loading = items.length === 0 && (discover.isFetching || trendingChannels.some((q) => q.isLoading) || fromSubs.some((q) => q.isLoading));
  return { items, loading, loadMore: () => discover.hasNextPage && !discover.isFetchingNextPage && discover.fetchNextPage() };
}

/** Full-screen vertical Shorts player (mobile layout, enabled in settings). */
export function ShortsPage() {
  useDocumentTitle('Shorts');
  const { id } = useParams();
  const navigate = useNavigate();
  const [startId] = useState(id);
  const { items, loading, loadMore } = useShortsFeed(startId);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The regular player steps aside while watching Shorts
  useEffect(() => {
    usePlayerSession.getState().controls?.pause();
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== active) setActive(i);
  };

  useEffect(() => {
    const cur = items[active];
    if (cur) navigate(`/shorts/${cur.videoId}`, { replace: true });
    if (active >= items.length - 4) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, items.length]);

  return (
    <div className="m-shorts" ref={scrollRef} onScroll={onScroll}>
      {loading && (
        <div className="m-shorts-empty">
          <div className="m-shorts-spinner" />
        </div>
      )}
      {!loading && !items.length && <div className="m-shorts-empty">No Shorts found. Subscribe to some channels to fill this up.</div>}
      {items.map((s, i) => (
        <ShortSlide
          key={s.videoId}
          item={s}
          active={i === active}
          near={Math.abs(i - active) <= 1}
          muted={muted}
          onUnmute={() => setMuted(false)}
          onAutoplayBlocked={() => setMuted(true)}
        />
      ))}
    </div>
  );
}

function ShortSlide({
  item,
  active,
  near,
  muted,
  onUnmute,
  onAutoplayBlocked,
}: {
  item: ShortItem;
  active: boolean;
  near: boolean;
  muted: boolean;
  onUnmute: () => void;
  onAutoplayBlocked: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState<'play' | 'pause' | null>(null);
  const [comments, setComments] = useState(false);
  const [failed, setFailed] = useState(false);
  const { data: details } = useVideoDetails(active ? item.videoId : null);
  const title = details?.title || item.title;
  const author = details?.author || item.author;
  const authorId = details?.authorId || item.authorId;
  const avatar = useChannelAvatar(authorId, details ? avatarUrl(details.authorThumbnails, 36) : undefined);
  const lite: VideoLite = { videoId: item.videoId, title, author, authorId, lengthSeconds: details?.lengthSeconds || 0 };
  const rating = useLibrary((s) => (s.liked.some((x) => x.videoId === item.videoId) ? 'like' : s.disliked.includes(item.videoId) ? 'dislike' : 'none'));
  const setRating = useLibrary((s) => s.setRating);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      setPaused(false);
      v.play().catch(() => {
        // Browsers may refuse sound without a recent tap: start muted instead
        v.muted = true;
        onAutoplayBlocked();
        v.play().catch(() => setPaused(true));
      });
    } else v.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [flash]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (muted) {
      onUnmute();
      return;
    }
    if (v.paused) {
      v.play();
      setPaused(false);
      setFlash('play');
    } else {
      v.pause();
      setPaused(true);
      setFlash('pause');
    }
  };

  const share = async () => {
    const url = `https://youtube.com/shorts/${item.videoId}`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <section className="m-short">
      <img className="m-short-poster" src={videoThumb(item.videoId, 'hqdefault')} alt="" />
      {near && (
        <video
          ref={videoRef}
          className="m-short-video"
          src={progressiveUrl(item.videoId)}
          loop
          playsInline
          preload={active ? 'auto' : 'metadata'}
          onError={() => setFailed(true)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(v.currentTime / v.duration);
          }}
        />
      )}
      <div className="m-short-tap" onClick={toggle} />
      {flash && (
        <div className="m-short-flash">
          <PIcon name={flash} />
        </div>
      )}
      {failed && <div className="m-short-failed">This Short can't be played here. Swipe up for the next one.</div>}
      {paused && !flash && !failed && (
        <div className="m-short-flash static">
          <PIcon name="play" />
        </div>
      )}
      {muted && active && (
        <button className="m-short-unmute" onClick={onUnmute}>
          <PIcon name="volumeMute" />
          Tap to unmute
        </button>
      )}

      <div className="m-short-actions">
        <button
          className={'m-short-action' + (rating === 'like' ? ' on' : '')}
          onClick={() => setRating(lite, rating === 'like' ? 'none' : 'like')}
          aria-label="Like"
        >
          <span className="m-short-action-icon">
            <Icon name={rating === 'like' ? 'likeFilled' : 'like'} />
          </span>
          {details?.likeCount ? compactNumber(details.likeCount + (rating === 'like' ? 1 : 0)) : 'Like'}
        </button>
        <button
          className={'m-short-action' + (rating === 'dislike' ? ' on' : '')}
          onClick={() => setRating(lite, rating === 'dislike' ? 'none' : 'dislike')}
          aria-label="Dislike"
        >
          <span className="m-short-action-icon">
            <Icon name={rating === 'dislike' ? 'dislikeFilled' : 'dislike'} />
          </span>
          Dislike
        </button>
        <button className="m-short-action" onClick={() => setComments(true)} aria-label="Comments">
          <span className="m-short-action-icon">
            <Icon name="feedback" />
          </span>
          Comments
        </button>
        <button className="m-short-action" onClick={share} aria-label="Share">
          <span className="m-short-action-icon">
            <Icon name="share" />
          </span>
          Share
        </button>
        <Link className="m-short-action" to={`/watch?v=${item.videoId}`} aria-label="Open in player">
          <span className="m-short-action-icon">
            <Icon name="yourVideos" />
          </span>
          Player
        </Link>
      </div>

      <div className="m-short-info">
        {authorId && (
          <div className="m-short-owner">
            <Link to={`/channel/${authorId}`} className="m-short-owner-link">
              <Avatar src={avatar} name={author || '?'} size={32} />
              <span>{author}</span>
            </Link>
            <SubscribeButton authorId={authorId} author={author} thumbnail={avatar} size="sm" />
          </div>
        )}
        <div className="m-short-title clamp-2">{title}</div>
      </div>

      <div className="m-short-progress">
        <div style={{ width: `${progress * 100}%` }} />
      </div>

      {comments && (
        <Sheet onClose={() => setComments(false)} title="Comments" className="m-short-comments">
          <div style={{ padding: '0 12px' }}>
            <Comments videoId={item.videoId} onTimestamp={(t) => videoRef.current && (videoRef.current.currentTime = t)} />
          </div>
        </Sheet>
      )}
    </section>
  );
}
