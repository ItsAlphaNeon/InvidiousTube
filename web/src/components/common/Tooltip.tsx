import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Global tooltip: any element with a `data-tooltip` attribute shows a YouTube style grey tooltip
 * below it (or above with data-tooltip-pos="top") after a short hover delay.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; above: boolean } | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    let current: HTMLElement | null = null;
    const show = (el: HTMLElement) => {
      const text = el.dataset.tooltip;
      if (!text || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      const above = el.dataset.tooltipPos === 'top';
      setTip({ text, x: r.left + r.width / 2, y: above ? r.top - 8 : r.bottom + 8, above });
    };
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.('[data-tooltip]') as HTMLElement | null;
      if (el === current) return;
      current = el;
      clearTimeout(timer);
      setTip(null);
      if (el) timer = window.setTimeout(() => show(el), 500);
    };
    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTip(null);
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('mousedown', hide);
    window.addEventListener('scroll', hide, { passive: true });
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mousedown', hide);
      window.removeEventListener('scroll', hide);
    };
  }, []);
  if (!tip) return null;
  return createPortal(<TooltipBox {...tip} />, document.body);
}

function TooltipBox({ text, x, y, above }: { text: string; x: number; y: number; above: boolean }) {
  const [w, setW] = useState(0);
  return (
    <div
      className="tooltip"
      ref={(el) => {
        if (el && el.offsetWidth !== w) setW(el.offsetWidth);
      }}
      style={{
        left: Math.max(4, Math.min(x - w / 2, window.innerWidth - w - 4)),
        top: y,
        transform: above ? 'translateY(-100%)' : undefined,
        visibility: w ? 'visible' : 'hidden',
      }}
    >
      {text}
    </div>
  );
}
