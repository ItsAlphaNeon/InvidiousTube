import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type SearchOptions } from '../api/invidious';
import type { ChannelItem, PlaylistItem, SearchItem, VideoItem } from '../api/types';
import { toCard } from '../components/cards/model';
import { ChannelCardList, ListSkeleton, PlaylistCardList, VideoCardList } from '../components/cards/VideoCards';
import { Modal } from '../components/common/Modal';
import { Spinner } from '../components/common/Spinner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useInfiniteTrigger } from '../hooks/useInView';
import { Icon } from '../icons';
import { useLibrary } from '../stores/library';
import { useSettings } from '../stores/settings';
import './search.css';

const FILTER_GROUPS: { key: keyof SearchOptions | 'features'; title: string; options: { value: string; label: string }[] }[] = [
  {
    key: 'date',
    title: 'Upload date',
    options: [
      { value: 'hour', label: 'Last hour' },
      { value: 'today', label: 'Today' },
      { value: 'week', label: 'This week' },
      { value: 'month', label: 'This month' },
      { value: 'year', label: 'This year' },
    ],
  },
  {
    key: 'type',
    title: 'Type',
    options: [
      { value: 'video', label: 'Video' },
      { value: 'channel', label: 'Channel' },
      { value: 'playlist', label: 'Playlist' },
      { value: 'movie', label: 'Movie' },
    ],
  },
  {
    key: 'duration',
    title: 'Duration',
    options: [
      { value: 'short', label: 'Under 4 minutes' },
      { value: 'medium', label: '4 - 20 minutes' },
      { value: 'long', label: 'Over 20 minutes' },
    ],
  },
  {
    key: 'features',
    title: 'Features',
    options: [
      { value: 'live', label: 'Live' },
      { value: '4k', label: '4K' },
      { value: 'hd', label: 'HD' },
      { value: 'subtitles', label: 'Subtitles/CC' },
      { value: 'creative_commons', label: 'Creative Commons' },
      { value: '360', label: '360°' },
      { value: 'vr180', label: 'VR180' },
      { value: '3d', label: '3D' },
      { value: 'hdr', label: 'HDR' },
      { value: 'location', label: 'Location' },
      { value: 'purchased', label: 'Purchased' },
    ],
  },
  {
    key: 'sort',
    title: 'Sort by',
    options: [
      { value: 'relevance', label: 'Relevance' },
      { value: 'date', label: 'Upload date' },
      { value: 'views', label: 'View count' },
      { value: 'rating', label: 'Rating' },
    ],
  },
];

const CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'video', label: 'Videos' },
  { id: 'channel', label: 'Channels' },
  { id: 'playlist', label: 'Playlists' },
  { id: 'unwatched', label: 'Unwatched' },
  { id: 'watched', label: 'Watched' },
  { id: 'recent', label: 'Recently uploaded' },
  { id: 'live', label: 'Live' },
];

export function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('search_query') || '';
  useDocumentTitle(q);
  const region = useSettings((s) => s.region);
  const history = useLibrary((s) => s.history);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const opts: SearchOptions = {
    sort: (params.get('sort') as SearchOptions['sort']) || undefined,
    date: (params.get('date') as SearchOptions['date']) || undefined,
    duration: (params.get('duration') as SearchOptions['duration']) || undefined,
    type: (params.get('type') as SearchOptions['type']) || undefined,
    features: params.get('features') || undefined,
    region,
  };
  const chip = params.get('chip') || (opts.type && ['video', 'channel', 'playlist'].includes(opts.type) ? opts.type : 'all');

  const query = useInfiniteQuery({
    queryKey: ['search', q, opts],
    queryFn: ({ pageParam }) => api.search(q, { ...opts, type: opts.type || 'all' }, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.length > 0 && pages.length < 20 ? pages.length + 1 : undefined),
    enabled: !!q,
    staleTime: 10 * 60 * 1000,
  });
  const sentinel = useInfiniteTrigger(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
  }, !!query.hasNextPage);

  const watched = new Set(history.map((h) => h.videoId));
  const seen = new Set<string>();
  const items: SearchItem[] = (query.data?.pages.flat() ?? []).filter((it) => {
    const key = it.type === 'video' ? it.videoId : it.type === 'channel' ? it.authorId : it.type === 'playlist' ? it.playlistId : it.title;
    if (seen.has(key)) return false;
    seen.add(key);
    switch (chip) {
      case 'unwatched':
        return it.type === 'video' && !watched.has(it.videoId);
      case 'watched':
        return it.type === 'video' && watched.has(it.videoId);
      case 'recent':
        return it.type === 'video' && !!it.published && Date.now() / 1000 - it.published < 14 * 86400;
      case 'live':
        return it.type === 'video' && !!it.liveNow;
      default:
        return true;
    }
  });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next);
  };

  const setChip = (id: string) => {
    const next = new URLSearchParams(params);
    if (['video', 'channel', 'playlist'].includes(id)) {
      next.set('type', id);
      next.delete('chip');
    } else {
      next.delete('type');
      if (id === 'all') next.delete('chip');
      else next.set('chip', id);
    }
    setParams(next);
  };

  const activeFilterCount = ['date', 'type', 'duration', 'features', 'sort'].filter((k) => params.get(k)).length;

  return (
    <div className="search-page">
      <div className="search-header">
        <div className="search-chips">
          {CHIPS.map((c) => (
            <button key={c.id} className={'chip' + (chip === c.id ? ' active' : '')} onClick={() => setChip(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <button className="pill-btn text search-filters-btn" onClick={() => setFiltersOpen(true)}>
          Filters
          {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
          <Icon name="filter" />
        </button>
      </div>

      {filtersOpen && (
        <Modal onClose={() => setFiltersOpen(false)} className="search-filter-modal">
          <div className="search-filter-header">
            <span>Search filters</span>
            <button className="icon-btn" onClick={() => setFiltersOpen(false)} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          <div className="search-filter-groups">
            {FILTER_GROUPS.map((g) => {
              const current = params.get(g.key as string);
              const selected = g.key === 'features' ? (current || '').split(',').filter(Boolean) : [current];
              return (
                <div key={g.key} className="search-filter-group">
                  <h4>{g.title.toUpperCase()}</h4>
                  {g.options.map((o) => {
                    const on = selected.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        className={'search-filter-option' + (on ? ' on' : '')}
                        onClick={() => {
                          if (g.key === 'features') {
                            const nextSel = on ? selected.filter((x) => x !== o.value) : [...selected, o.value];
                            setParam('features', nextSel.length ? nextSel.join(',') : null);
                          } else setParam(g.key as string, on ? null : o.value);
                        }}
                      >
                        {o.label}
                        {on && <Icon name="close" size={16} />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      <div className="search-results">
        {query.isLoading && Array.from({ length: 6 }, (_, i) => <ListSkeleton key={i} />)}
        {query.isError && <div className="error-box">Search failed: {(query.error as Error).message}</div>}
        {items.map((it, i) => {
          if (it.type === 'video' || it.type === 'shortVideo') return <VideoCardList key={(it as VideoItem).videoId + i} v={toCard(it as VideoItem)} />;
          if (it.type === 'channel') return <ChannelCardList key={(it as ChannelItem).authorId} c={it as ChannelItem} />;
          if (it.type === 'playlist') return <PlaylistCardList key={(it as PlaylistItem).playlistId} p={it as PlaylistItem} />;
          if (it.type === 'hashtag')
            return (
              <Link key={it.title} to={`/hashtag/${encodeURIComponent(it.title.replace(/^#/, ''))}`} className="hashtag-result">
                <span className="hashtag-icon">#</span>
                <span>
                  <span className="hashtag-title">{it.title}</span>
                  <span className="secondary">
                    {it.videoCount.toLocaleString()} videos · {it.channelCount.toLocaleString()} channels
                  </span>
                </span>
              </Link>
            );
          return null;
        })}
        {!query.isLoading && query.data && items.length === 0 && (
          <div className="page-empty">
            <h2>No results found</h2>
            <p>Try different keywords or remove search filters</p>
          </div>
        )}
        <div ref={sentinel} />
        {query.isFetchingNextPage && <Spinner />}
      </div>
    </div>
  );
}
