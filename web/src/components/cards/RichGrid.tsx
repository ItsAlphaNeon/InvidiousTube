import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Grid that picks its column count like YouTube's rich grid (min item width ~320px, max 6 columns). */
export function RichGrid({ children, className, minItem = 320, maxCols = 6 }: { children: ReactNode; className?: string; minItem?: number; maxCols?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth - 48; // horizontal padding
      setCols(Math.max(1, Math.min(maxCols, Math.floor((w + 16) / (minItem + 16)))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minItem, maxCols]);
  return (
    <div ref={ref} className={'rich-grid' + (className ? ' ' + className : '')} style={{ '--grid-cols': cols } as CSSProperties}>
      {children}
    </div>
  );
}
