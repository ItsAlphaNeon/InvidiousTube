import { memo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { compactNumber, subsText, timeAgo, viewsText } from '../../api/format';
import { avatarUrl, playlistThumb, videoThumb } from '../../api/images';
import type { ChannelItem, PlaylistItem } from '../../api/types';
import { useChannelAvatar } from '../../hooks/useAccount';
import { useCardDetails } from '../../hooks/useCardDetails';
import { Icon, VerifiedBadge } from '../../icons';
import { Avatar } from '../common/Avatar';
import { RichText } from '../common/RichText';
import { SubscribeButton } from '../common/SubscribeButton';
import type { CardVideo } from './model';
import { Thumbnail } from './Thumbnail';
import { VideoMenu } from './VideoMenu';
import './cards.css';

export function metaLine(v: CardVideo): ReactNode {
  if (v.liveNow) {
    return <span>{v.viewCount ? `${compactNumber(v.viewCount)} watching` : v.viewCountText && !/^0( |$)/.test(v.viewCountText) ? `${v.viewCountText.replace(/ views?$/, '')} watching` : ''}</span>;
  }
  if (v.isUpcoming && v.premiereTimestamp) {
    return (
      <span>
        Premieres {new Date(v.premiereTimestamp * 1000).toLocaleString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit' })}
      </span>
    );
  }
  const views = viewsText(v.viewCount, v.viewCountText);
  const when = v.published ? timeAgo(v.published) : v.publishedText;
  return (
    <>
      {views && <span>{views}</span>}
      {views && when && <span className="dot-sep" />}
      {when && <span>{when}</span>}
    </>
  );
}

function ChannelName({ v, className }: { v: { author: string; authorId: string; authorVerified?: boolean }; className?: string }) {
  return (
    <Link to={`/channel/${v.authorId}`} className={'card-channel' + (className ? ' ' + className : '')} onClick={(e) => e.stopPropagation()} data-tooltip={v.author}>
      <span className="card-channel-name">{v.author}</span>
      {v.authorVerified && <VerifiedBadge />}
    </Link>
  );
}

function Badges({ v }: { v: CardVideo }) {
  const badges: string[] = [];
  if (v.isNew) badges.push('New');
  if (v.is4k) badges.push('4K');
  if (v.hasCaptions) badges.push('CC');
  if (!badges.length && !v.liveNow) return null;
  return (
    <div className="card-badges">
      {v.liveNow && (
        <span className="card-badge live">
          <Icon name="live" size={12} />
          LIVE
        </span>
      )}
      {badges.map((b) => (
        <span key={b} className="card-badge">
          {b}
        </span>
      ))}
    </div>
  );
}

function watchHref(v: CardVideo, list?: string, index?: number) {
  return `/watch?v=${v.videoId}${list ? `&list=${list}` : ''}${index != null ? `&index=${index + 1}` : ''}`;
}

// ---------------------------------------------------------------- grid (home / subscriptions / channel)

export const VideoCardGrid = memo(function VideoCardGrid({ v: raw, showAvatar = true, showChannel = true }: { v: CardVideo; showAvatar?: boolean; showChannel?: boolean }) {
  const { ref, v } = useCardDetails(raw);
  const avatar = useChannelAvatar(v.authorId, v.authorThumbnails?.length ? avatarUrl(v.authorThumbnails, 36) : undefined);
  return (
    <div className="rich-item" ref={ref}>
      <Link to={watchHref(v)} className="rich-thumb-link">
        <Thumbnail videoId={v.videoId} lengthSeconds={v.lengthSeconds} liveNow={v.liveNow} upcoming={v.isUpcoming} preview />
      </Link>
      <div className="rich-details">
        {showAvatar && (
          <Link to={`/channel/${v.authorId}`} className="rich-avatar">
            <Avatar src={avatar} name={v.author} size={36} />
          </Link>
        )}
        <div className="rich-meta">
          <h3 className="rich-title">
            <Link to={watchHref(v)} className="clamp-2" title={v.title}>
              {v.title}
            </Link>
          </h3>
          <div className="rich-byline">
            {showChannel && <ChannelName v={v} />}
            <div className="card-meta-line">{metaLine(v)}</div>
          </div>
          {v.liveNow && <Badges v={v} />}
        </div>
        <VideoMenu video={v} className="rich-menu" />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------- compact (watch sidebar)

export const VideoCardCompact = memo(function VideoCardCompact({
  v,
  list,
  index,
  active,
}: {
  v: CardVideo;
  list?: string;
  index?: number;
  active?: boolean;
}) {
  return (
    <div className={'compact-item' + (active ? ' active' : '')}>
      <Link to={watchHref(v, list, index)} className="compact-thumb-link">
        <Thumbnail videoId={v.videoId} lengthSeconds={v.lengthSeconds} liveNow={v.liveNow} quality="mqdefault" className="compact-thumb" />
      </Link>
      <Link to={watchHref(v, list, index)} className="compact-meta">
        <h3 className="compact-title clamp-2" title={v.title}>
          {v.title}
        </h3>
        <div className="compact-byline">
          <div className="card-channel">
            <span className="card-channel-name">{v.author}</span>
            {v.authorVerified && <VerifiedBadge />}
          </div>
          <div className="card-meta-line">{metaLine(v)}</div>
          <Badges v={v} />
        </div>
      </Link>
      <VideoMenu video={v} className="compact-menu" />
    </div>
  );
});

// ---------------------------------------------------------------- list (search results, history)

export const VideoCardList = memo(function VideoCardList({
  v: raw,
  extraMenu,
  size = 'lg',
  showDescription = true,
}: {
  v: CardVideo;
  extraMenu?: (close: () => void) => ReactNode;
  size?: 'lg' | 'md';
  showDescription?: boolean;
}) {
  const { ref, v } = useCardDetails(raw);
  const avatar = useChannelAvatar(v.authorId, v.authorThumbnails?.length ? avatarUrl(v.authorThumbnails, 24) : undefined);
  return (
    <div className={'list-item list-item-' + size} ref={ref}>
      <Link to={watchHref(v)} className="list-thumb-link">
        <Thumbnail videoId={v.videoId} lengthSeconds={v.lengthSeconds} liveNow={v.liveNow} upcoming={v.isUpcoming} preview />
      </Link>
      <div className="list-meta">
        <div className="list-title-row">
          <h3 className="list-title">
            <Link to={watchHref(v)} className="clamp-2" title={v.title}>
              {v.title}
            </Link>
          </h3>
          <VideoMenu video={v} extra={extraMenu} className="list-menu" />
        </div>
        {size === 'lg' ? (
          <>
            <div className="card-meta-line list-meta-line">{metaLine(v)}</div>
            <Link to={`/channel/${v.authorId}`} className="list-channel">
              <Avatar src={avatar} name={v.author} size={24} />
              <span className="card-channel-name">{v.author}</span>
              {v.authorVerified && <VerifiedBadge />}
            </Link>
          </>
        ) : (
          <div className="list-md-byline">
            <ChannelName v={v} />
            <span className="dot-sep" />
            <span className="card-meta-line">{metaLine(v)}</span>
          </div>
        )}
        {showDescription && v.description && (
          <div className="list-desc clamp-2">
            {v.descriptionHtml ? <RichText html={v.descriptionHtml} /> : v.description}
          </div>
        )}
        <Badges v={v} />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------- channel result

export function ChannelCardList({ c }: { c: ChannelItem }) {
  const handle = c.channelHandle;
  return (
    <div className="channel-result">
      <Link to={`/channel/${c.authorId}`} className="channel-result-avatar">
        <Avatar src={avatarUrl(c.authorThumbnails, 136)} name={c.author} size={136} />
      </Link>
      <Link to={`/channel/${c.authorId}`} className="channel-result-meta">
        <h3 className="channel-result-name">
          {c.author}
          {c.authorVerified && <VerifiedBadge />}
        </h3>
        <div className="card-meta-line">
          {handle && <span>{handle}</span>}
          {handle && c.subCount >= 0 && <span className="dot-sep" />}
          {c.subCount >= 0 && <span>{subsText(c.subCount)}</span>}
          {!handle && c.videoCount > 0 && (
            <>
              <span className="dot-sep" />
              <span>{c.videoCount.toLocaleString()} videos</span>
            </>
          )}
        </div>
        {c.description && <div className="channel-result-desc clamp-2">{c.description}</div>}
      </Link>
      <div className="channel-result-action">
        <SubscribeButton authorId={c.authorId} author={c.author} thumbnail={avatarUrl(c.authorThumbnails, 48)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- playlists

function PlaylistStack({ thumb, count, label = 'videos' }: { thumb: string; count: number; label?: string }) {
  return (
    <div className="pl-thumb">
      <div className="pl-stack pl-stack-2" />
      <div className="pl-stack pl-stack-1" />
      <div className="pl-thumb-inner">
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="pl-thumb-empty" />}
        <div className="thumb-badge pl-badge">
          <Icon name="playlists" size={16} />
          {count} {label}
        </div>
        <div className="pl-hover">
          <Icon name="play" size={20} />
          PLAY ALL
        </div>
      </div>
    </div>
  );
}

export function plThumbFor(p: { playlistThumbnail?: string; videos?: { videoId: string }[] }): string {
  if (p.playlistThumbnail) return playlistThumb(p.playlistThumbnail);
  const first = p.videos?.[0]?.videoId;
  return first ? videoThumb(first, 'hqdefault') : '';
}

export function PlaylistCardGrid({
  p,
  href,
  subtitle,
}: {
  p: { title: string; playlistId: string; videoCount: number; author?: string; authorId?: string; playlistThumbnail?: string; videos?: { videoId: string }[] };
  href?: string;
  subtitle?: ReactNode;
}) {
  const link = href || `/playlist?list=${p.playlistId}`;
  return (
    <div className="rich-item pl-grid-item">
      <Link to={link} className="rich-thumb-link">
        <PlaylistStack thumb={plThumbFor(p)} count={p.videoCount} />
      </Link>
      <div className="rich-details">
        <div className="rich-meta">
          <h3 className="rich-title">
            <Link to={link} className="clamp-2">
              {p.title}
            </Link>
          </h3>
          <div className="rich-byline">
            {subtitle ?? (p.author && p.authorId ? <ChannelName v={{ author: p.author, authorId: p.authorId }} /> : p.author)}
            <Link to={link} className="pl-view-full">
              View full playlist
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlaylistCardList({ p }: { p: PlaylistItem }) {
  const link = `/playlist?list=${p.playlistId}`;
  return (
    <div className="list-item list-item-lg">
      <Link to={link} className="list-thumb-link">
        <PlaylistStack thumb={plThumbFor(p)} count={p.videoCount} />
      </Link>
      <div className="list-meta">
        <h3 className="list-title">
          <Link to={link} className="clamp-2">
            {p.title}
          </Link>
        </h3>
        <div className="card-meta-line list-meta-line">
          {p.authorId ? <ChannelName v={{ author: p.author, authorId: p.authorId, authorVerified: p.authorVerified }} /> : p.author}
          <span className="dot-sep" />
          <span>Playlist</span>
        </div>
        <div className="pl-list-videos">
          {(p.videos || []).slice(0, 2).map((v) => (
            <Link key={v.videoId} to={`/watch?v=${v.videoId}&list=${p.playlistId}`} className="pl-list-video">
              {v.title}
            </Link>
          ))}
        </div>
        <Link to={link} className="pl-view-full">
          View full playlist
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- skeletons

export function RichSkeleton() {
  return (
    <div className="rich-item">
      <div className="thumb skeleton" style={{ borderRadius: 12 }} />
      <div className="rich-details">
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%', flex: 'none', marginRight: 12 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 20, width: '90%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 20, width: '60%' }} />
        </div>
      </div>
    </div>
  );
}

export function CompactSkeleton() {
  return (
    <div className="compact-item">
      <div className="compact-thumb-link">
        <div className="thumb compact-thumb skeleton" />
      </div>
      <div style={{ flex: 1, paddingTop: 2 }}>
        <div className="skeleton" style={{ height: 16, width: '95%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: '60%' }} />
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="list-item list-item-lg">
      <div className="list-thumb-link">
        <div className="thumb skeleton" />
      </div>
      <div className="list-meta">
        <div className="skeleton" style={{ height: 22, width: '80%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 16, width: '40%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 16, width: '30%' }} />
      </div>
    </div>
  );
}
