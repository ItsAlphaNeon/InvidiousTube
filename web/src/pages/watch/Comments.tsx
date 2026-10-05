import { useInfiniteQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { compactNumber, fullNumber } from '../../api/format';
import { avatarUrl, proxyImage } from '../../api/images';
import { api } from '../../api/invidious';
import type { Comment } from '../../api/types';
import { Avatar } from '../../components/common/Avatar';
import { Menu, MenuItem } from '../../components/common/Menu';
import { RichText } from '../../components/common/RichText';
import { Spinner } from '../../components/common/Spinner';
import { useInfiniteTrigger } from '../../hooks/useInView';
import { Icon } from '../../icons';
import { useAuth } from '../../stores/auth';
import { toast } from '../../stores/ui';

interface Props {
  videoId: string;
  onTimestamp: (t: number) => void;
}

export function Comments({ videoId, onTimestamp }: Props) {
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLButtonElement>(null);
  const username = useAuth((s) => s.username);

  const q = useInfiniteQuery({
    queryKey: ['comments', videoId, sort],
    queryFn: ({ pageParam }) => api.comments(videoId, sort, pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last) => last.continuation || undefined,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const sentinel = useInfiniteTrigger(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, !!q.hasNextPage, '600px');

  const count = q.data?.pages[0]?.commentCount;
  const comments = q.data?.pages.flatMap((p) => p.comments) ?? [];

  if (q.isError) {
    return (
      <div className="comments">
        <div className="comments-disabled">Comments are turned off or unavailable. <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">Learn more</a></div>
      </div>
    );
  }

  return (
    <section className="comments" id="comments">
      <div className="comments-header">
        <h2 className="comments-count">{count != null ? `${fullNumber(count)} Comments` : 'Comments'}</h2>
        <button ref={sortRef} className="comments-sort" onClick={() => setSortOpen((o) => !o)}>
          <Icon name="sort" />
          Sort by
        </button>
        <Menu anchor={sortRef} open={sortOpen} onClose={() => setSortOpen(false)} align="left" minWidth={180}>
          <MenuItem onClick={() => (setSort('top'), setSortOpen(false))}>
            <span style={{ fontWeight: sort === 'top' ? 500 : 400 }}>Top comments</span>
          </MenuItem>
          <MenuItem onClick={() => (setSort('new'), setSortOpen(false))}>
            <span style={{ fontWeight: sort === 'new' ? 500 : 400 }}>Newest first</span>
          </MenuItem>
        </Menu>
      </div>
      <div className="comment-box">
        <Avatar name={username || 'You'} size={40} />
        <input
          className="comment-box-input"
          placeholder="Add a comment..."
          readOnly
          onFocus={(e) => {
            e.currentTarget.blur();
            toast('Commenting is not supported through Invidious');
          }}
        />
      </div>
      {q.isLoading && <Spinner />}
      {comments.map((c) => (
        <CommentThread key={c.commentId} c={c} videoId={videoId} onTimestamp={onTimestamp} />
      ))}
      <div ref={sentinel} />
      {q.isFetchingNextPage && <Spinner />}
    </section>
  );
}

function CommentThread({ c, videoId, onTimestamp }: { c: Comment; videoId: string; onTimestamp: (t: number) => void }) {
  const [showReplies, setShowReplies] = useState(false);
  const replyCount = c.replies?.replyCount ?? 0;
  return (
    <div className="comment-thread">
      <CommentView c={c} videoId={videoId} onTimestamp={onTimestamp} />
      {replyCount > 0 && c.replies && (
        <div className="comment-replies">
          <button className={'replies-toggle' + (showReplies ? ' open' : '')} onClick={() => setShowReplies((s) => !s)}>
            <Icon name={showReplies ? 'caretUp' : 'caretDown'} />
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </button>
          {showReplies && <Replies videoId={videoId} continuation={c.replies.continuation} onTimestamp={onTimestamp} />}
        </div>
      )}
    </div>
  );
}

function Replies({ videoId, continuation, onTimestamp }: { videoId: string; continuation: string; onTimestamp: (t: number) => void }) {
  const q = useInfiniteQuery({
    queryKey: ['replies', videoId, continuation],
    queryFn: ({ pageParam }) => api.replies(videoId, pageParam),
    initialPageParam: continuation,
    getNextPageParam: (last) => last.continuation || undefined,
    staleTime: 5 * 60 * 1000,
  });
  const replies = q.data?.pages.flatMap((p) => p.comments) ?? [];
  return (
    <div className="replies-list">
      {replies.map((r) => (
        <CommentView key={r.commentId} c={r} videoId={videoId} onTimestamp={onTimestamp} small />
      ))}
      {q.isLoading && <Spinner size={24} style={{ margin: '12px 0' }} />}
      {q.hasNextPage && !q.isFetchingNextPage && (
        <button className="replies-toggle more" onClick={() => q.fetchNextPage()}>
          <Icon name="reply" style={{ transform: 'scaleX(-1) rotate(180deg)' }} />
          Show more replies
        </button>
      )}
      {q.isFetchingNextPage && <Spinner size={24} style={{ margin: '12px 0' }} />}
    </div>
  );
}

function CommentView({ c, small, videoId, onTimestamp }: { c: Comment; small?: boolean; videoId: string; onTimestamp: (t: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [liked, setLiked] = useState<'like' | 'dislike' | null>(null);
  const avatar = c.authorThumbnails?.length ? avatarUrl(c.authorThumbnails, small ? 24 : 40) : proxyImage(c.authorThumbnail);
  const size = small ? 24 : 40;
  return (
    <div className={'comment' + (small ? ' small' : '')}>
      <Link to={`/channel/${c.authorId}`} className="comment-avatar">
        <Avatar src={avatar} name={c.author} size={size} />
      </Link>
      <div className="comment-main">
        {c.isPinned && (
          <div className="comment-pinned">
            <Icon name="pin" size={16} />
            Pinned by {c.creatorHeart?.creatorName ?? 'creator'}
          </div>
        )}
        <div className="comment-header">
          <Link to={`/channel/${c.authorId}`} className={'comment-author' + (c.authorIsChannelOwner ? ' owner' : '')}>
            {c.author}
            {c.verified && (
              <svg className="verified" viewBox="0 0 24 24" style={{ marginLeft: 4 }}>
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zM9.8 17.3l-4.2-4.1L7 11.8l2.8 2.7L17 7.4l1.4 1.4-8.6 8.5z" />
              </svg>
            )}
          </Link>
          <span className="comment-time">
            {c.publishedText}
            {c.isEdited && ' (edited)'}
          </span>
        </div>
        <div
          className={'comment-content' + (expanded ? ' expanded' : '')}
          ref={(el) => {
            if (el && !expanded) {
              const o = el.scrollHeight > el.clientHeight + 2;
              if (o !== overflows) setOverflows(o);
            }
          }}
        >
          <RichText html={c.contentHtml || c.content} onTimestamp={onTimestamp} currentVideoId={videoId} />
        </div>
        {(overflows || expanded) && (
          <button className="comment-readmore" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
        <div className="comment-toolbar">
          <button className="icon-btn sm" onClick={() => setLiked((l) => (l === 'like' ? null : 'like'))} aria-label="Like">
            <Icon name={liked === 'like' ? 'likeFilled' : 'like'} />
          </button>
          <span className="comment-likes">{c.likeCount + (liked === 'like' ? 1 : 0) > 0 ? compactNumber(c.likeCount + (liked === 'like' ? 1 : 0)) : ''}</span>
          <button className="icon-btn sm" onClick={() => setLiked((l) => (l === 'dislike' ? null : 'dislike'))} aria-label="Dislike">
            <Icon name={liked === 'dislike' ? 'dislikeFilled' : 'dislike'} />
          </button>
          {c.creatorHeart && (
            <span className="comment-heart" data-tooltip={`❤ by ${c.creatorHeart.creatorName}`}>
              <Avatar src={proxyImage(c.creatorHeart.creatorThumbnail)} name={c.creatorHeart.creatorName} size={16} />
              <svg viewBox="0 0 24 24" className="comment-heart-icon">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </span>
          )}
          <button className="pill-btn text sm comment-reply-btn" onClick={() => toast('Replying is not supported through Invidious')}>
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}
