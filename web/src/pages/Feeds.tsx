import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, type TrendingType } from '../api/invidious';
import { toCard } from '../components/cards/model';
import { RichGrid } from '../components/cards/RichGrid';
import { ListSkeleton, RichSkeleton, VideoCardGrid, VideoCardList } from '../components/cards/VideoCards';
import { Avatar } from '../components/common/Avatar';
import { Spinner } from '../components/common/Spinner';
import { SubscribeButton } from '../components/common/SubscribeButton';
import { flattenFeed, useChannelAvatar, useSubscriptionFeed, useSubscriptions, type SubInfo } from '../hooks/useAccount';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useInfiniteTrigger } from '../hooks/useInView';
import { Icon, type IconName } from '../icons';
import { useLibrary } from '../stores/library';
import { useSettings } from '../stores/settings';
import './feeds.css';

// ------------------------------------------------------------------ Trending / Explore

const TRENDING_TABS: { id: TrendingType; label: string; icon: IconName; title: string }[] = [
  { id: 'default', label: 'Now', icon: 'trending', title: 'Trending' },
  { id: 'music', label: 'Music', icon: 'music', title: 'Music' },
  { id: 'gaming', label: 'Gaming', icon: 'gaming', title: 'Gaming' },
  { id: 'movies', label: 'Movies', icon: 'movies', title: 'Movies' },
  { id: 'news', label: 'News', icon: 'news', title: 'News' },
];

export function Trending() {
  const [params, setParams] = useSearchParams();
  const type = (params.get('type') as TrendingType) || 'default';
  const region = useSettings((s) => s.region);
  const tab = TRENDING_TABS.find((t) => t.id === type) ?? TRENDING_TABS[0];
  useDocumentTitle(tab.title);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['trending', type, region],
    queryFn: () => api.trending(type, region),
    staleTime: 30 * 60 * 1000,
  });
  const notInterested = useLibrary((s) => s.notInterested);
  const videos = (data || []).filter((v) => !notInterested.includes(v.videoId));
  return (
    <div className="feed-page trending-page">
      <div className="page-narrow">
        <div className="trending-header">
          <div className="trending-icon">
            <Icon name={tab.icon} size={40} />
          </div>
          <h1 className="feed-title-lg">{tab.title}</h1>
        </div>
        <div className="tab-bar">
          {TRENDING_TABS.map((t) => (
            <button
              key={t.id}
              className={'tab' + (t.id === type ? ' active' : '')}
              onClick={() => setParams(t.id === 'default' ? {} : { type: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
        {isLoading && Array.from({ length: 6 }, (_, i) => <ListSkeleton key={i} />)}
        {isError && <div className="error-box">Couldn't load trending videos.</div>}
        <div className="trending-list">
          {videos.map((v) => (
            <VideoCardList key={v.videoId} v={toCard(v)} size="md" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Subscriptions feed

export function Subscriptions() {
  useDocumentTitle('Subscriptions');
  const { subs } = useSubscriptions();
  const feed = useSubscriptionFeed(true);
  const videos = useMemo(() => flattenFeed(feed.data?.pages), [feed.data]);
  const sentinel = useInfiniteTrigger(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
  }, !!feed.hasNextPage);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  if (!subs.length && !feed.isLoading) {
    return (
      <div className="page-empty">
        <Icon name="subscriptions" />
        <h2>Don't miss new videos</h2>
        <p>Subscribe to channels and their latest videos will show up here.</p>
        <Link to="/feed/trending" className="pill-btn filled">
          Explore channels
        </Link>
      </div>
    );
  }

  return (
    <div className="feed-page">
      <div className="feed-header">
        <h2 className="feed-title">Latest</h2>
        <div className="feed-header-actions">
          <Link to="/feed/channels" className="pill-btn cta-text">
            Manage
          </Link>
          <button className={'icon-btn' + (view === 'grid' ? ' toggled' : '')} onClick={() => setView('grid')} aria-label="Grid">
            <Icon name="yourVideos" />
          </button>
          <button className={'icon-btn' + (view === 'list' ? ' toggled' : '')} onClick={() => setView('list')} aria-label="List">
            <Icon name="playlists" />
          </button>
        </div>
      </div>
      {view === 'grid' ? (
        <RichGrid>
          {feed.isLoading ? Array.from({ length: 16 }, (_, i) => <RichSkeleton key={i} />) : videos.map((v) => <VideoCardGrid key={v.videoId} v={toCard(v)} />)}
        </RichGrid>
      ) : (
        <div className="page-narrow">
          {videos.map((v) => (
            <VideoCardList key={v.videoId} v={toCard(v)} />
          ))}
        </div>
      )}
      {feed.isError && <div className="error-box">Couldn't load your subscription feed.</div>}
      <div ref={sentinel} />
      {feed.isFetchingNextPage && <Spinner />}
    </div>
  );
}

// ------------------------------------------------------------------ Manage subscriptions

export function Channels() {
  useDocumentTitle('All subscriptions');
  const { subs, isLoading } = useSubscriptions();
  const [q, setQ] = useState('');
  const sorted = [...subs].sort((a, b) => a.author.localeCompare(b.author)).filter((s) => s.author.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page-narrow channels-page">
      <div className="channels-header">
        <h1 className="feed-title-lg">All subscriptions</h1>
        <input className="text-field channels-filter" placeholder="Filter channels" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading && <Spinner />}
      {sorted.map((s) => (
        <ChannelRow key={s.authorId} s={s} />
      ))}
      {!isLoading && !subs.length && (
        <div className="page-empty">
          <p>You haven't subscribed to any channels yet.</p>
        </div>
      )}
    </div>
  );
}

function ChannelRow({ s }: { s: SubInfo }) {
  const avatar = useChannelAvatar(s.authorId, s.thumbnail);
  return (
    <div className="channel-row">
      <Link to={`/channel/${s.authorId}`} className="channel-row-avatar">
        <Avatar src={avatar} name={s.author} size={136} />
      </Link>
      <Link to={`/channel/${s.authorId}`} className="channel-row-meta">
        <div className="channel-row-name">{s.author}</div>
      </Link>
      <SubscribeButton authorId={s.authorId} author={s.author} thumbnail={avatar} />
    </div>
  );
}

// ------------------------------------------------------------------ Hashtag

export function Hashtag() {
  const { tag = '' } = useParams();
  useDocumentTitle(`#${tag}`);
  const q = useInfiniteQuery({
    queryKey: ['hashtag', tag],
    queryFn: ({ pageParam }) => api.hashtag(tag, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.results?.length ? pages.length + 1 : undefined),
    staleTime: 10 * 60 * 1000,
  });
  const sentinel = useInfiniteTrigger(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, !!q.hasNextPage);
  const videos = q.data?.pages.flatMap((p) => p.results || []) ?? [];
  return (
    <div className="feed-page">
      <div className="hashtag-header">
        <h1 className="feed-title-lg">#{tag}</h1>
      </div>
      <RichGrid>
        {q.isLoading ? Array.from({ length: 12 }, (_, i) => <RichSkeleton key={i} />) : videos.map((v) => <VideoCardGrid key={v.videoId} v={toCard(v)} />)}
      </RichGrid>
      <div ref={sentinel} />
      {q.isFetchingNextPage && <Spinner />}
    </div>
  );
}

export function NotFound() {
  useDocumentTitle('404 Not Found');
  return (
    <div className="page-empty">
      <h2>This page isn't available. Sorry about that.</h2>
      <p>Try searching for something else.</p>
      <Link to="/" className="pill-btn filled">
        Go home
      </Link>
    </div>
  );
}
