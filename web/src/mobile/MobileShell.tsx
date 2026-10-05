import { useEffect, useRef, type ReactNode } from 'react';
import { Link, Routes, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Toasts } from '../components/common/Toasts';
import { NotificationsButton } from '../components/layout/Masthead';
import { useSubscriptions } from '../hooks/useAccount';
import { Icon, Logo, type IconName } from '../icons';
import { PlayerHost } from '../player/PlayerHost';
import { useAuth } from '../stores/auth';
import { usePlayerSession } from '../stores/player';
import { useSettings } from '../stores/settings';
import { useUI } from '../stores/ui';
import { MobileMiniplayer } from './MobileMiniplayer';
import { MobileSearch } from './MobileSearch';
import { MobileWatch } from './MobileWatch';
import './mobile.css';

const HOME_LOCATION: Location = { pathname: '/', search: '', hash: '', state: null, key: 'm-home' };
const ROOT_TABS = ['/shorts', '/feed/trending', '/feed/explore', '/feed/subscriptions', '/feed/you', '/feed/library'];

/**
 * App-style layout for phones: a top app bar, a bottom tab bar, and a watch view that slides up over
 * whatever page you were on (so minimizing returns to the same page and scroll position).
 */
export function MobileShell({ routes }: { routes: ReactNode }) {
  const location = useLocation();
  const isWatch = location.pathname === '/watch';
  const searchOpen = location.hash === '#search';

  // The page under the watch view stays mounted: remember the last non-watch location
  const pageRef = useRef<Location>(isWatch ? HOME_LOCATION : location);
  if (!isWatch) pageRef.current = location;
  const page = pageRef.current;
  useEffect(() => {
    useUI.setState({ mobilePage: page.pathname + page.search });
  }, [page.pathname, page.search]);

  // Leaving the watch view while a video is loaded switches to the miniplayer
  const hasVideo = usePlayerSession((s) => !!s.videoId);
  const setMini = usePlayerSession((s) => s.setMini);
  useEffect(() => {
    if (isWatch) setMini(false);
    else if (hasVideo) setMini(true);
  }, [isWatch, hasVideo, setMini]);

  // Scroll to the top when the underlying page changes (not when the watch view opens or closes)
  const pageKey = page.pathname + page.search;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.documentElement.classList.remove('m-bar-hidden');
  }, [pageKey]);

  useBarAutoHide();
  const shortsTab = useSettings((s) => s.shortsTab);
  const inShorts = shortsTab && page.pathname.startsWith('/shorts');
  const mini = usePlayerSession((s) => s.mini && !!s.videoId) && !inShorts;

  return (
    <div className={'m-app' + (mini ? ' has-mini' : '') + (isWatch ? ' watch-open' : '') + (inShorts ? ' shorts-open' : '')}>
      {!inShorts && <MobileTopBar pathname={page.pathname} search={page.search} />}
      <main className="m-page">
        <Routes location={page}>{routes}</Routes>
      </main>
      <MobileMiniplayer />
      <BottomNav pathname={page.pathname} />
      {isWatch && <MobileWatch />}
      {searchOpen && <MobileSearch />}
      <PlayerHost />
      <Toasts />
    </div>
  );
}

/** Hide the top bar while scrolling down and bring it back when scrolling up, like the app. */
function useBarAutoHide() {
  useEffect(() => {
    let last = window.scrollY;
    const root = document.documentElement;
    const on = () => {
      const y = window.scrollY;
      const d = y - last;
      if (Math.abs(d) < 8 && y > 0) return;
      last = y;
      root.classList.toggle('m-bar-hidden', d > 0 && y > 120);
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      window.removeEventListener('scroll', on);
      root.classList.remove('m-bar-hidden');
    };
  }, []);
}

export function useMobileBack() {
  const navigate = useNavigate();
  return () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/', { replace: true }));
}

function MobileTopBar({ pathname, search }: { pathname: string; search: string }) {
  const navigate = useNavigate();
  const back = useMobileBack();
  const brand = useSettings((s) => s.brand);
  const loggedIn = useAuth((s) => s.loggedIn);
  const { subs } = useSubscriptions();
  const isRoot = ROOT_TABS.includes(pathname);
  const isResults = pathname === '/results' || pathname === '/search';
  const params = new URLSearchParams(search);
  const query = isResults ? params.get('search_query') || params.get('q') || '' : '';
  const openSearch = () => navigate({ pathname, search, hash: 'search' });

  if (isResults) {
    return (
      <header className="m-topbar">
        <button className="m-icon-btn" onClick={back} aria-label="Back">
          <Icon name="back" />
        </button>
        <button className="m-topbar-query" onClick={openSearch}>
          {query}
        </button>
      </header>
    );
  }

  return (
    <header className="m-topbar">
      {!isRoot && (
        <button className="m-icon-btn" onClick={back} aria-label="Back">
          <Icon name="back" />
        </button>
      )}
      <Link
        to="/"
        className="m-topbar-logo"
        aria-label={`${brand} Home`}
        onClick={() => pathname === '/' && window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <Logo brand={brand} />
      </Link>
      <div className="m-topbar-end">
        {(loggedIn || subs.length > 0) && <NotificationsButton />}
        <button className="m-icon-btn" onClick={openSearch} aria-label="Search">
          <Icon name="search" />
        </button>
      </div>
    </header>
  );
}

const TABS: { to: string; label: string; icon: IconName; iconOn: IconName; match: (p: string) => boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', iconOn: 'homeFilled', match: (p) => p === '/' },
  { to: '/feed/trending', label: 'Explore', icon: 'trending', iconOn: 'trending', match: (p) => p === '/feed/trending' || p === '/feed/explore' },
  {
    to: '/feed/subscriptions',
    label: 'Subscriptions',
    icon: 'subscriptions',
    iconOn: 'subscriptionsFilled',
    match: (p) => p === '/feed/subscriptions' || p === '/feed/channels',
  },
  { to: '/feed/you', label: 'You', icon: 'account', iconOn: 'account', match: (p) => ['/feed/you', '/feed/library', '/feed/history', '/feed/playlists'].includes(p) },
];

const SHORTS_TAB = { to: '/shorts', label: 'Shorts', icon: 'shorts' as IconName, iconOn: 'shorts' as IconName, match: (p: string) => p.startsWith('/shorts') };

function BottomNav({ pathname }: { pathname: string }) {
  const username = useAuth((s) => s.username);
  const shortsTab = useSettings((s) => s.shortsTab);
  const tabs = shortsTab ? [TABS[0], SHORTS_TAB, ...TABS.slice(1)] : TABS;
  return (
    <nav className="m-bottomnav">
      {tabs.map((t) => {
        const on = t.match(pathname);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={'m-tab' + (on ? ' on' : '')}
            onClick={(e) => {
              // Tapping the tab you're on scrolls back to the top
              if (pathname === t.to || (t.to === '/shorts' && t.match(pathname))) {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >
            {t.to === '/feed/you' && username ? (
              <span className={'m-tab-avatar' + (on ? ' on' : '')}>{username.slice(0, 1).toUpperCase()}</span>
            ) : (
              <Icon name={on ? t.iconOn : t.icon} />
            )}
            <span className="m-tab-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
