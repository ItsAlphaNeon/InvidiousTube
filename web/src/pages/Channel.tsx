import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatDate, fullNumber, subsText } from '../api/format';
import { avatarUrl, bannerUrl, proxyImage } from '../api/images';
import { api } from '../api/invidious';
import type { ChannelDetails, CommunityPost, SearchItem, VideoItem } from '../api/types';
import { toCard } from '../components/cards/model';
import { RichGrid } from '../components/cards/RichGrid';
import { Thumbnail } from '../components/cards/Thumbnail';
import { ListSkeleton, PlaylistCardGrid, RichSkeleton, VideoCardGrid, VideoCardList } from '../components/cards/VideoCards';
import { Avatar } from '../components/common/Avatar';
import { Modal } from '../components/common/Modal';
import { RichText } from '../components/common/RichText';
import { Spinner } from '../components/common/Spinner';
import { SubscribeButton } from '../components/common/SubscribeButton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useInfiniteTrigger } from '../hooks/useInView';
import { Icon, VerifiedBadge } from '../icons';
import './channel.css';

const TABS = [
  { id: 'featured', label: 'Home' },
  { id: 'videos', label: 'Videos' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'streams', label: 'Live' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'community', label: 'Community' },
];

/** Resolves /@handle, /c/name and /user/name routes to a channel ID. */
export function ChannelResolver() {
  const { handle, name, tab } = useParams();
  const path = handle ? `@${handle.replace(/^@/, '')}` : name ? `c/${name}` : '';
  const { data, isError } = useQuery({
    queryKey: ['resolve', path],
    queryFn: () => api.resolveUrl(`https://www.youtube.com/${path}`),
    enabled: !!path,
    staleTime: Infinity,
  });
  if (isError) return <div className="page-empty"><h2>This channel doesn't exist.</h2></div>;
  if (data?.ucid) return <Navigate to={`/channel/${data.ucid}${tab ? `/${tab}` : ''}`} replace />;
  return <Spinner />;
}

export function Channel() {
  const { id = '', tab = 'featured' } = useParams();
  const navigate = useNavigate();
  const { data: ch, isLoading, isError, error } = useQuery({
    queryKey: ['channel', id],
    queryFn: () => api.channel(id),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
  useDocumentTitle(ch?.author);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(tab === 'search');
  const [searchParams] = useSearchParams();
  const [searchQ, setSearchQ] = useState(searchParams.get('query') || '');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  if (isError) {
    return (
      <div className="page-empty">
        <h2>This channel is not available</h2>
        <p>{(error as Error)?.message}</p>
      </div>
    );
  }

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (searchQ.trim()) navigate(`/channel/${id}/search?query=${encodeURIComponent(searchQ.trim())}`);
  };

  const banner = ch ? bannerUrl(ch.authorBanners) : '';
  const handle = ch?.channelHandle;

  return (
    <div className="channel-page">
      <div className="channel-inner">
        {banner && (
          <div className="channel-banner">
            <img src={banner} alt="" />
          </div>
        )}
        <header className="channel-header">
          {isLoading || !ch ? (
            <div className="channel-header-skeleton">
              <div className="skeleton" style={{ width: 160, height: 160, borderRadius: '50%' }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 36, width: 300, marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 20, width: 240 }} />
              </div>
            </div>
          ) : (
            <>
              <Avatar src={avatarUrl(ch.authorThumbnails, 160)} name={ch.author} size={160} className="channel-avatar" />
              <div className="channel-header-meta">
                <h1 className="channel-name">
                  {ch.author}
                  {ch.authorVerified && <VerifiedBadge />}
                </h1>
                <div className="channel-meta-line">
                  {handle && <span className="channel-handle">{handle}</span>}
                  {handle && <span className="dot-sep" />}
                  <span>{subsText(ch.subCount)}</span>
                  {ch.latestVideos?.length > 0 && ch.totalViews > 0 && (
                    <>
                      <span className="dot-sep" />
                      <span>{fullNumber(ch.totalViews)} views</span>
                    </>
                  )}
                </div>
                {ch.description && (
                  <button className="channel-desc" onClick={() => setAboutOpen(true)}>
                    <span className="channel-desc-text">{ch.description.split('\n')[0]}</span>
                    <Icon name="chevronRight" size={20} />
                  </button>
                )}
                <div className="channel-buttons">
                  <SubscribeButton authorId={ch.authorId} author={ch.author} thumbnail={avatarUrl(ch.authorThumbnails, 48)} />
                </div>
              </div>
            </>
          )}
        </header>
        <nav className="channel-tabs">
          {TABS.map((t) => (
            <Link key={t.id} to={`/channel/${id}${t.id === 'featured' ? '' : `/${t.id}`}`} className={'channel-tab' + (tab === t.id ? ' active' : '')}>
              {t.label}
            </Link>
          ))}
          {searchOpen ? (
            <form className="channel-search" onSubmit={onSearch}>
              <Icon name="search" />
              <input ref={searchRef} value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search" onBlur={() => !searchQ && setSearchOpen(false)} />
            </form>
          ) : (
            <button className="icon-btn channel-search-btn" onClick={() => setSearchOpen(true)} aria-label="Search">
              <Icon name="search" />
            </button>
          )}
        </nav>
        <div className="channel-content">
          {ch && tab === 'featured' && <ChannelHome ch={ch} />}
          {(tab === 'videos' || tab === 'streams') && <ChannelVideos id={id} tab={tab} />}
          {tab === 'shorts' && <ChannelShorts id={id} />}
          {tab === 'playlists' && <ChannelPlaylists id={id} />}
          {tab === 'community' && <ChannelCommunity id={id} />}
          {tab === 'search' && <ChannelSearch id={id} q={searchParams.get('query') || ''} />}
        </div>
      </div>
      {aboutOpen && ch && <AboutDialog ch={ch} onClose={() => setAboutOpen(false)} />}
    </div>
  );
}

function AboutDialog({ ch, onClose }: { ch: ChannelDetails; onClose: () => void }) {
  return (
    <Modal onClose={onClose} className="channel-about" width={560}>
      <div className="channel-about-header">
        <h2>About</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="channel-about-body">
        <RichText html={ch.descriptionHtml || ch.description} className="channel-about-desc" />
        <h3>Channel details</h3>
        <div className="channel-about-row">
          <Icon name="globe" />
          <a href={`https://www.youtube.com/channel/${ch.authorId}`} target="_blank" rel="noreferrer">
            www.youtube.com/channel/{ch.authorId}
          </a>
        </div>
        <div className="channel-about-row">
          <Icon name="person" />
          {subsText(ch.subCount)}
        </div>
        {ch.totalViews > 0 && (
          <div className="channel-about-row">
            <Icon name="trending" />
            {fullNumber(ch.totalViews)} views
          </div>
        )}
        {ch.joined > 0 && (
          <div className="channel-about-row">
            <Icon name="info" />
            Joined {formatDate(ch.joined)}
          </div>
        )}
        {ch.tags && ch.tags.length > 0 && (
          <div className="description-tags" style={{ marginTop: 16 }}>
            {ch.tags.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ChannelHome({ ch }: { ch: ChannelDetails }) {
  const latest = ch.latestVideos || [];
  const featured = latest[0];
  return (
    <div className="channel-home">
      {featured && (
        <div className="channel-featured">
          <Link to={`/watch?v=${featured.videoId}`} className="channel-featured-thumb">
            <Thumbnail videoId={featured.videoId} lengthSeconds={featured.lengthSeconds} liveNow={featured.liveNow} quality="maxresdefault" />
          </Link>
          <div className="channel-featured-meta">
            <Link to={`/watch?v=${featured.videoId}`} className="channel-featured-title">
              {featured.title}
            </Link>
            <div className="card-meta-line" style={{ fontSize: 12, lineHeight: '18px', marginTop: 4 }}>
              {featured.viewCountText || ''} <span className="dot-sep" /> {featured.publishedText}
            </div>
            {featured.descriptionHtml && <RichText html={featured.descriptionHtml} className="channel-featured-desc clamp-3" />}
          </div>
        </div>
      )}
      {latest.length > 1 && (
        <section className="channel-shelf">
          <div className="channel-shelf-header">
            <h2>Videos</h2>
            <Link to={`/channel/${ch.authorId}/videos`} className="pill-btn icon-leading sm">
              <Icon name="play" size={20} />
              Play all
            </Link>
          </div>
          <RichGrid minItem={210} maxCols={6} className="channel-grid shelf">
            {latest.slice(1, 13).map((v) => (
              <VideoCardGrid key={v.videoId} v={toCard(v)} showAvatar={false} showChannel={false} />
            ))}
          </RichGrid>
        </section>
      )}
      {ch.relatedChannels?.length > 0 && (
        <section className="channel-shelf">
          <div className="channel-shelf-header">
            <h2>Channels</h2>
          </div>
          <div className="related-channels">
            {ch.relatedChannels.map((c) => (
              <Link key={c.authorId} to={`/channel/${c.authorId}`} className="related-channel">
                <Avatar src={avatarUrl(c.authorThumbnails, 104)} name={c.author} size={104} />
                <span className="related-channel-name">{c.author}</span>
                <span className="secondary">{subsText(c.subCount)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {!latest.length && <div className="page-empty"><p>This channel doesn't have any content</p></div>}
    </div>
  );
}

const SORTS = [
  { id: 'newest', label: 'Latest' },
  { id: 'popular', label: 'Popular' },
  { id: 'oldest', label: 'Oldest' },
] as const;

function useChannelTab(id: string, tab: 'videos' | 'shorts' | 'streams', sort: 'newest' | 'popular' | 'oldest') {
  const q = useInfiniteQuery({
    queryKey: ['channel-videos', id, tab, sort],
    queryFn: ({ pageParam }) => api.channelVideos(id, tab, sort, pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last) => last.continuation || undefined,
    staleTime: 10 * 60 * 1000,
  });
  const sentinel = useInfiniteTrigger(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, !!q.hasNextPage);
  const videos: VideoItem[] = q.data?.pages.flatMap((p) => p.videos) ?? [];
  return { q, videos, sentinel };
}

function SortChips({ sort, setSort }: { sort: string; setSort: (s: 'newest' | 'popular' | 'oldest') => void }) {
  return (
    <div className="channel-chips">
      {SORTS.map((s) => (
        <button key={s.id} className={'chip' + (sort === s.id ? ' active' : '')} onClick={() => setSort(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

function ChannelVideos({ id, tab }: { id: string; tab: 'videos' | 'streams' }) {
  const [sort, setSort] = useState<'newest' | 'popular' | 'oldest'>('newest');
  const { q, videos, sentinel } = useChannelTab(id, tab, sort);
  return (
    <>
      <SortChips sort={sort} setSort={setSort} />
      <RichGrid minItem={250} maxCols={4} className="channel-grid">
        {q.isLoading ? Array.from({ length: 12 }, (_, i) => <RichSkeleton key={i} />) : videos.map((v) => <VideoCardGrid key={v.videoId} v={toCard(v)} showAvatar={false} showChannel={false} />)}
      </RichGrid>
      {!q.isLoading && !videos.length && <div className="page-empty"><p>This channel has no {tab === 'streams' ? 'live streams' : 'videos'}.</p></div>}
      <div ref={sentinel} />
      {q.isFetchingNextPage && <Spinner />}
    </>
  );
}

function ChannelShorts({ id }: { id: string }) {
  const [sort, setSort] = useState<'newest' | 'popular' | 'oldest'>('newest');
  const { q, videos, sentinel } = useChannelTab(id, 'shorts', sort);
  return (
    <>
      <SortChips sort={sort} setSort={setSort} />
      <div className="shorts-grid">
        {videos.map((v) => (
          <Link key={v.videoId} to={`/watch?v=${v.videoId}`} className="shorts-item">
            <div className="shorts-thumb">
              <img src={`/vi/${v.videoId}/oardefault.jpg`} onError={(e) => (e.currentTarget.src = `/vi/${v.videoId}/hqdefault.jpg`)} alt="" loading="lazy" />
            </div>
            <div className="shorts-title clamp-2">{v.title}</div>
            <div className="shorts-views">{v.viewCountText || ''}</div>
          </Link>
        ))}
      </div>
      {q.isLoading && <Spinner />}
      {!q.isLoading && !videos.length && <div className="page-empty"><p>This channel has no Shorts.</p></div>}
      <div ref={sentinel} />
      {q.isFetchingNextPage && <Spinner />}
    </>
  );
}

function ChannelPlaylists({ id }: { id: string }) {
  const q = useInfiniteQuery({
    queryKey: ['channel-playlists', id],
    queryFn: ({ pageParam }) => api.channelPlaylists(id, 'last', pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last) => last.continuation || undefined,
    staleTime: 10 * 60 * 1000,
  });
  const sentinel = useInfiniteTrigger(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, !!q.hasNextPage);
  const playlists = q.data?.pages.flatMap((p) => p.playlists) ?? [];
  return (
    <>
      <div className="channel-chips">
        <span className="channel-section-label">Created playlists</span>
      </div>
      <RichGrid minItem={210} maxCols={6} className="channel-grid">
        {playlists.map((p) => (
          <PlaylistCardGrid key={p.playlistId} p={p} subtitle={<span />} />
        ))}
      </RichGrid>
      {q.isLoading && <Spinner />}
      {!q.isLoading && !playlists.length && <div className="page-empty"><p>This channel has no playlists.</p></div>}
      <div ref={sentinel} />
    </>
  );
}

function ChannelCommunity({ id }: { id: string }) {
  const q = useInfiniteQuery({
    queryKey: ['channel-community', id],
    queryFn: ({ pageParam }) => api.channelCommunity(id, pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last) => last.continuation || undefined,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const sentinel = useInfiniteTrigger(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, !!q.hasNextPage);
  const posts = q.data?.pages.flatMap((p) => p.comments) ?? [];
  return (
    <div className="community-list">
      {posts.map((p) => (
        <CommunityPostView key={p.commentId} p={p} />
      ))}
      {q.isLoading && <Spinner />}
      {(q.isError || (!q.isLoading && !posts.length)) && <div className="page-empty"><p>This channel hasn't posted yet</p></div>}
      <div ref={sentinel} />
    </div>
  );
}

function CommunityPostView({ p }: { p: CommunityPost }) {
  const att = p.attachment;
  const img = att?.imageThumbnails?.length ? [...att.imageThumbnails].sort((a, b) => b.width - a.width)[0] : undefined;
  return (
    <div className="community-post">
      <Avatar src={avatarUrl(p.authorThumbnails, 40)} name={p.author} size={40} />
      <div className="community-post-main">
        <div className="comment-header">
          <span className="comment-author">{p.author}</span>
          <span className="comment-time">{p.publishedText}</span>
        </div>
        <RichText html={p.contentHtml || p.content} className="community-post-text" />
        {img && <img className="community-post-image" src={proxyImage(img.url)} alt="" loading="lazy" />}
        {att?.type === 'video' && att.videoId && (
          <Link to={`/watch?v=${att.videoId}`} className="community-post-video">
            <Thumbnail videoId={att.videoId} quality="mqdefault" />
            <span>{att.title as string}</span>
          </Link>
        )}
        {att?.type === 'poll' && (
          <div className="community-poll">
            {(att.choices as unknown as { text: string }[] | string[] | undefined)?.map((c, i) => (
              <div key={i} className="community-poll-choice">
                {typeof c === 'string' ? c : c.text}
              </div>
            ))}
            {att.totalVotes != null && <div className="secondary">{fullNumber(att.totalVotes)} votes</div>}
          </div>
        )}
        <div className="comment-toolbar">
          <button className="icon-btn sm" aria-label="Like">
            <Icon name="like" />
          </button>
          <span className="comment-likes">{p.likeCount ? fullNumber(p.likeCount) : ''}</span>
          <button className="icon-btn sm" aria-label="Dislike">
            <Icon name="dislike" />
          </button>
          {p.replyCount ? <span className="comment-likes" style={{ marginLeft: 12 }}>{p.replyCount} comments</span> : null}
        </div>
      </div>
    </div>
  );
}

function ChannelSearch({ id, q }: { id: string; q: string }) {
  const query = useQuery({
    queryKey: ['channel-search', id, q],
    queryFn: () => api.channelSearch(id, q),
    enabled: !!q,
    staleTime: 10 * 60 * 1000,
  });
  const items = (query.data || []).filter((x: SearchItem) => x.type === 'video') as VideoItem[];
  return (
    <div className="channel-search-results">
      {query.isLoading && Array.from({ length: 4 }, (_, i) => <ListSkeleton key={i} />)}
      {items.map((v) => (
        <VideoCardList key={v.videoId} v={toCard(v)} size="md" />
      ))}
      {!query.isLoading && q && !items.length && <div className="page-empty"><p>This channel has no content matching “{q}”</p></div>}
    </div>
  );
}
