import { useEffect, type RefObject } from 'react';

export function useClickOutside(refs: RefObject<HTMLElement | null>[], onOutside: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (refs.some((r) => r.current?.contains(t))) return;
      onOutside();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [enabled, onOutside, refs]);
}
