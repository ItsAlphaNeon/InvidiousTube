import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { compactNumber, formatDate, formatDuration, fullNumber, timeAgo } from '../../api/format';
import { avatarUrl } from '../../api/images';
import type { VideoDetails } from '../../api/types';
import { Avatar } from '../../components/common/Avatar';
import { RichText } from '../../components/common/RichText';
import { parseChapters } from '../../player/chapters';

interface Props {
  video: VideoDetails;
  onTimestamp: (t: number) => void;
  /** start expanded without a "Show less" (mobile description sheet) */
  sheet?: boolean;
}

export function Description({ video, onTimestamp, sheet }: Props) {
  const [expanded, setExpanded] = useState(!!sheet);
  const chapters = useMemo(() => parseChapters(video.description, video.lengthSeconds), [video]);
  const tags = (video.keywords || []).slice(0, 3);
  const hashtagsInDesc = useMemo(() => {
    const m = video.description.match(/#[\p{L}\p{N}_]+/gu) || [];
    return [...new Set(m)].slice(0, 3);
  }, [video.description]);
  const headerTags = hashtagsInDesc.length ? hashtagsInDesc : [];
  const isPremiere = video.isUpcoming && video.premiereTimestamp;

  return (
    <div
      className={'description' + (expanded ? ' expanded' : '')}
      onClick={() => !expanded && setExpanded(true)}
      role={expanded ? undefined : 'button'}
      tabIndex={expanded ? undefined : 0}
    >
      <div className="description-info">
        <span className="description-views">
          {video.liveNow
            ? `${fullNumber(video.viewCount)} watching now`
            : expanded
              ? `${fullNumber(video.viewCount)} views`
              : `${compactNumber(video.viewCount)} views`}
        </span>
        <span className="description-date">
          {isPremiere
            ? `Premieres ${new Date(video.premiereTimestamp! * 1000).toLocaleString()}`
            : expanded
              ? formatDate(video.published)
              : timeAgo(video.published, video.publishedText)}
        </span>
        {headerTags.map((t) => (
          <Link key={t} className="description-tag" to={`/hashtag/${encodeURIComponent(t.slice(1))}`} onClick={(e) => e.stopPropagation()}>
            {t}
          </Link>
        ))}
      </div>
      <div className={'description-text' + (expanded ? '' : ' collapsed')}>
        <RichText html={video.descriptionHtml || video.description} onTimestamp={onTimestamp} currentVideoId={video.videoId} />
      </div>
      {!expanded && (
        <button className="description-more" onClick={(e) => (e.stopPropagation(), setExpanded(true))}>
          ...more
        </button>
      )}
      {expanded && (
        <>
          {chapters.length > 0 && (
            <div className="description-chapters" id="description-chapters">
              <h3 className="description-section-title">Chapters</h3>
              <div className="chapter-strip">
                {chapters.map((c, i) => (
                  <button key={i} className="chapter-card" onClick={() => onTimestamp(c.start)}>
                    <img src={`/vi/${video.videoId}/mqdefault.jpg`} alt="" loading="lazy" />
                    <div className="chapter-card-meta">
                      <div className="chapter-card-title clamp-2">{c.title}</div>
                      <div className="chapter-card-time">{formatDuration(c.start)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {video.genre && (
            <div className="description-section">
              <h3 className="description-section-title">Category</h3>
              <span>{video.genre}</span>
            </div>
          )}
          {tags.length > 0 && (
            <div className="description-section">
              <h3 className="description-section-title">Tags</h3>
              <div className="description-tags">
                {(video.keywords || []).slice(0, 20).map((k) => (
                  <Link key={k} to={`/results?search_query=${encodeURIComponent(k)}`} className="chip">
                    {k}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="description-section description-channel">
            <Link to={`/channel/${video.authorId}`} className="description-channel-link">
              <Avatar src={avatarUrl(video.authorThumbnails, 56)} name={video.author} size={56} />
              <div>
                <div className="description-channel-name">{video.author}</div>
                <div className="secondary">{video.subCountText} subscribers</div>
              </div>
            </Link>
            <div className="description-channel-buttons">
              <Link to={`/channel/${video.authorId}/videos`} className="pill-btn outline-grey">
                Videos
              </Link>
              <Link to={`/channel/${video.authorId}`} className="pill-btn outline-grey">
                About
              </Link>
            </div>
          </div>
          {!sheet && (
            <button className="description-less" onClick={() => setExpanded(false)}>
              Show less
            </button>
          )}
        </>
      )}
    </div>
  );
}
