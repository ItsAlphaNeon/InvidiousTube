import { useQueries } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, type TrendingType } from '../api/invidious';
import type { VideoItem } from '../api/types';
import { toCard } from '../components/cards/model';
import { RichGrid } from '../components/cards/RichGrid';
import { RichSkeleton, VideoCardGrid } from '../components/cards/VideoCards';
import { ChipBar, type ChipDef } from '../components/common/ChipBar';
import { Spinner } from '../components/common/Spinner';
import { flattenFeed, useSubscriptionFeed, useSubscriptions } from '../hooks/useAccount';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useInfiniteTrigger } from '../hooks/useInView';
import { useLibrary } from '../stores/library';
import { useSettings } from '../stores/settings';
import './pages.css';

const TRENDING_MIX: TrendingType[] = ['default', 'music', 'gaming', 'news', 'movies'];

function interleave<T>(lists: T[][], weights?: number[]): T[] {
  const out: T[] = [];
  const idx = lists.map(() => 0);
  let remaining = true;
  while (remaining) {
    remaining = false;
    lists.forEach((l, i) => {
      const take = weights?.[i] ?? 1;
      for (let k = 0; k < take && idx[i] < l.length; k++) {
        out.push(l[idx[i]++]);
        remaining = true;
      }
    });
  }
  return out;
}

function dedupe(videos: VideoItem[], hidden: Set<string>): VideoItem[] {
  const seen = new Set<string>();
  return videos.filter((v) => {
    if (!v?.videoId || seen.has(v.videoId) || hidden.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });
}

export function Home() {
  useDocumentTitle();
  const region = useSettings((s) => s.region);
  const { subs } = useSubscriptions();
  const hasSubs = subs.length > 0;
  const [chip, setChip] = useState('all');
  const notInterested = useLibrary((s) => s.notInterested);
  const history = useLibrary((s) => s.history);
  const hidden = useMemo(() => new Set(notInterested), [notInterested]);

  const chips: ChipDef[] = useMemo(
    () => [
      { id: 'all', label: 'All' },
      ...(hasSubs ? [{ id: 'subs', label: 'Subscriptions' }] : []),
      { id: 'music', label: 'Music' },
      { id: 'gaming', label: 'Gaming' },
      { id: 'news', label: 'News' },
      { id: 'movies', label: 'Movies' },
      { id: 'trending', label: 'Trending' },
      ...(hasSubs ? [{ id: 'recent', label: 'Recently uploaded' }] : []),
      ...(history.length ? [{ id: 'watched', label: 'Watched' }] : []),
      { id: 'new', label: 'New to you' },
    ],
    [hasSubs, history.length],
  );

  const trending = useQueries({
    queries: TRENDING_MIX.map((t) => ({
      queryKey: ['trending', t, region],
      queryFn: () => api.trending(t, region),
      staleTime: 30 * 60 * 1000,
      enabled: chip !== 'subs' && chip !== 'recent' && chip !== 'watched',
    })),
  });

  const feed = useSubscriptionFeed(hasSubs && (chip === 'all' || chip === 'subs' || chip === 'recent'));
  const feedVideos = useMemo(() => flattenFeed(feed.data?.pages), [feed.data]);

  const trendingBy = (t: TrendingType) => trending[TRENDING_MIX.indexOf(t)]?.data || [];
  const watchedIds = useMemo(() => new Set(history.map((h) => h.videoId)), [history]);

  const { videos, loading } = useMemo(() => {
    const t = TRENDING_MIX.map((x) => trendingBy(x));
    const trendingLoading = trending.some((q) => q.isLoading);
    switch (chip) {
      case 'all': {
        const mix = interleave(t);
        if (hasSubs) return { videos: dedupe(interleave([feedVideos, mix], [3, 1]), hidden), loading: feed.isLoading && trendingLoading };
        return { videos: dedupe(mix, hidden), loading: trendingLoading };
      }
      case 'subs':
        return { videos: dedupe(feedVideos, hidden), loading: feed.isLoading };
      case 'recent': {
        const week = Date.now() / 1000 - 7 * 86400;
        return { videos: dedupe(feedVideos.filter((v) => (v.published || 0) > week), hidden), loading: feed.isLoading };
      }
      case 'watched':
        return { videos: history.slice(0, 200).map((h) => ({ ...h, type: 'video' as const })) as VideoItem[], loading: false };
      case 'new':
        return { videos: dedupe(interleave(t), new Set([...hidden, ...watchedIds])), loading: trendingLoading };
      case 'trending':
        return { videos: dedupe(trendingBy('default'), hidden), loading: trending[0].isLoading };
      default:
        return { videos: dedupe(trendingBy(chip as TrendingType), hidden), loading: trending[TRENDING_MIX.indexOf(chip as TrendingType)]?.isLoading };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chip, trending.map((q) => q.dataUpdatedAt).join(), feedVideos, hidden, hasSubs, history, watchedIds]);

  const canLoadMore = (chip === 'all' || chip === 'subs' || chip === 'recent') && hasSubs && !!feed.hasNextPage;
  const sentinel = useInfiniteTrigger(() => {
    if (canLoadMore && !feed.isFetchingNextPage) feed.fetchNextPage();
  }, canLoadMore);

  return (
    <div className="home-page">
      <div className="home-chips">
        <ChipBar chips={chips} active={chip} onChange={(c) => {
          setChip(c);
          window.scrollTo({ top: 0 });
        }} />
      </div>
      <RichGrid className="has-chips">
        {loading && !videos.length
          ? Array.from({ length: 16 }, (_, i) => <RichSkeleton key={i} />)
          : videos.map((v) => <VideoCardGrid key={v.videoId} v={toCard(v)} />)}
      </RichGrid>
      {!loading && !videos.length && (
        <div className="page-empty">
          <h2>Nothing here yet</h2>
          <p>Try searching, or subscribe to some channels to fill your home feed.</p>
        </div>
      )}
      <div ref={sentinel} />
      {feed.isFetchingNextPage && <Spinner />}
    </div>
  );
}
