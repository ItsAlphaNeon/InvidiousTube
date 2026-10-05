import { useEffect, useRef } from 'react';

/** Calls `onVisible` whenever the returned ref's element scrolls within `rootMargin` of the viewport. */
export function useInfiniteTrigger(onVisible: () => void, enabled: boolean, rootMargin = '1200px') {
  const ref = useRef<HTMLDivElement | null>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cb.current();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, rootMargin]);
  return ref;
}
