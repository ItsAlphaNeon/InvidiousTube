import type { RecommendedVideo, Thumbnail, VideoItem } from '../../api/types';
import type { VideoLite } from '../../stores/library';

/** The normalized shape every video card renders from. */
export interface CardVideo {
  videoId: string;
  title: string;
  author: string;
  authorId: string;
  authorVerified?: boolean;
  authorThumbnails?: Thumbnail[];
  lengthSeconds: number;
  viewCount?: number;
  viewCountText?: string;
  published?: number;
  publishedText?: string;
  liveNow?: boolean;
  isUpcoming?: boolean;
  premiereTimestamp?: number;
  description?: string;
  descriptionHtml?: string;
  is4k?: boolean;
  isNew?: boolean;
  hasCaptions?: boolean;
  /** for videos inside playlists */
  index?: number;
  indexId?: string;
  /** Invidious returned placeholder data (e.g. degraded trending); fetch details lazily */
  incomplete?: boolean;
}

export function toCard(v: VideoItem | RecommendedVideo | VideoLite | CardVideo): CardVideo {
  const anyV = v as Partial<VideoItem & RecommendedVideo & VideoLite>;
  let viewCount = anyV.viewCount;
  let viewCountText = anyV.viewCountText;
  if (viewCount == null && viewCountText && /^[\d.,]+[KMB]?$/i.test(viewCountText.trim())) {
    // recommendedVideos uses "4M"; keep as text
    viewCountText = viewCountText.trim();
  }
  let published: number | undefined = typeof anyV.published === 'number' ? (anyV.published as number) : undefined;
  if (typeof anyV.published === 'string') published = Math.floor(Date.parse(anyV.published) / 1000) || undefined;
  if (viewCount === 0 && viewCountText && viewCountText !== '0 views') viewCount = undefined;
  // Newer Invidious trending responses contain zeroed metadata (0 views, length 0, published "now").
  const incomplete = !anyV.liveNow && !viewCount && (!published || Math.abs(Date.now() / 1000 - published) < 600);
  if (incomplete) {
    viewCount = undefined;
    viewCountText = undefined;
    published = undefined;
  }
  return {
    videoId: v.videoId,
    title: v.title,
    author: v.author,
    authorId: v.authorId,
    authorVerified: anyV.authorVerified,
    authorThumbnails: anyV.authorThumbnails,
    lengthSeconds: v.lengthSeconds ?? 0,
    viewCount,
    viewCountText,
    published,
    publishedText: incomplete ? undefined : anyV.publishedText,
    liveNow: anyV.liveNow,
    isUpcoming: anyV.isUpcoming,
    premiereTimestamp: anyV.premiereTimestamp,
    description: anyV.description,
    descriptionHtml: anyV.descriptionHtml,
    is4k: anyV.is4k,
    isNew: anyV.isNew,
    hasCaptions: anyV.hasCaptions,
    index: anyV.index,
    indexId: anyV.indexId,
    incomplete,
  };
}

export function toLiteFromCard(v: CardVideo): VideoLite {
  return {
    videoId: v.videoId,
    title: v.title,
    author: v.author,
    authorId: v.authorId,
    lengthSeconds: v.lengthSeconds,
    viewCount: v.viewCount,
    published: v.published,
    authorVerified: v.authorVerified,
    liveNow: v.liveNow,
  };
}
