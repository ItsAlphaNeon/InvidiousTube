import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/invidious';
import { toCard, type CardVideo } from '../components/cards/model';

/** Fills in metadata for cards Invidious returned without it, once the card scrolls into view. */
export function useCardDetails(v: CardVideo) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!v.incomplete || visible) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [v.incomplete, visible]);
  const { data } = useQuery({
    queryKey: ['video-lite', v.videoId],
    queryFn: () => api.videoLite(v.videoId),
    enabled: !!v.incomplete && visible,
    staleTime: Infinity,
    retry: false,
  });
  const merged: CardVideo = data ? { ...v, ...toCard({ ...data, type: 'video' }), authorThumbnails: v.authorThumbnails ?? data.authorThumbnails, incomplete: false } : v;
  return { ref, v: merged };
}
