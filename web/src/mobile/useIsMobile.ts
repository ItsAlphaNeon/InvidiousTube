import { useEffect, useSyncExternalStore } from 'react';
import { useSettings } from '../stores/settings';

const PHONE_UA = /Android.+Mobile|iPhone|iPod|Windows Phone|Mobi/i;
const NARROW = '(max-width: 640px)';

function subscribe(cb: () => void) {
  const mql = matchMedia(NARROW);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}
const narrowSnapshot = () => matchMedia(NARROW).matches;

/** True when the app/touch layout should be used (phones, or forced in settings). */
export function useIsMobile(): boolean {
  const layout = useSettings((s) => s.layout);
  const narrow = useSyncExternalStore(subscribe, narrowSnapshot);
  if (layout === 'mobile') return true;
  if (layout === 'desktop') return false;
  return PHONE_UA.test(navigator.userAgent) || narrow;
}

/** Mirrors the layout onto <html> so portals (menus, dialogs) can be styled too. */
export function useMobileClass(mobile: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle('is-mobile', mobile);
  }, [mobile]);
}

export const isStandalone = () =>
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as { standalone?: boolean }).standalone === true;
