import { useEffect } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { useWindowWidth } from '../../hooks/useMediaQuery';
import { Miniplayer } from '../../player/Miniplayer';
import { PlayerHost } from '../../player/PlayerHost';
import { usePlayerSession } from '../../stores/player';
import { useUI } from '../../stores/ui';
import { Toasts } from '../common/Toasts';
import { TooltipLayer } from '../common/Tooltip';
import { FullGuide, GuideDrawer, MiniGuide } from './Guide';
import { Masthead } from './Masthead';
import './layout.css';

export type GuideMode = 'full' | 'mini' | 'none';

export function AppShell() {
  const { pathname } = useLocation();
  const width = useWindowWidth();
  const isWatch = pathname === '/watch';
  const guideExpanded = useUI((s) => s.guideExpanded);
  const drawerOpen = useUI((s) => s.drawerOpen);
  const toggleGuide = useUI((s) => s.toggleGuide);
  const closeDrawer = useUI((s) => s.closeDrawer);

  let mode: GuideMode;
  if (isWatch || width < 792) mode = 'none';
  else if (width < 1313) mode = 'mini';
  else mode = guideExpanded ? 'full' : 'mini';
  const drawerMode = isWatch || width < 1313;

  // Close the drawer on navigation
  useEffect(() => closeDrawer(), [pathname, closeDrawer]);

  // Leaving the watch page while a video is loaded switches to the miniplayer.
  const hasVideo = usePlayerSession((s) => !!s.videoId);
  const setMini = usePlayerSession((s) => s.setMini);
  useEffect(() => {
    if (isWatch) setMini(false);
    else if (hasVideo) setMini(true);
  }, [isWatch, hasVideo, setMini]);

  const { search } = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, search, navType]);

  return (
    <div className={`app guide-${mode}-mode`}>
      <Masthead onMenu={() => toggleGuide(drawerMode)} />
      {mode === 'full' && <FullGuide />}
      {mode === 'mini' && <MiniGuide />}
      <GuideDrawer open={drawerOpen && drawerMode} onClose={closeDrawer} />
      <main className="page-manager">
        <Outlet />
      </main>
      <PlayerHost />
      <Miniplayer />
      <Toasts />
      <TooltipLayer />
    </div>
  );
}
