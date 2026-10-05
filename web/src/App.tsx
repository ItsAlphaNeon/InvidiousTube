import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { resolveYouTubeUrl } from './api/youtubeUrl';
import { AppShell } from './components/layout/AppShell';
import { Channel, ChannelResolver } from './pages/Channel';
import { Channels, Hashtag, NotFound, Subscriptions, Trending } from './pages/Feeds';
import { Home } from './pages/Home';
import { History, PlaylistsPage, You } from './pages/Library';
import { Login } from './pages/Login';
import { Playlist } from './pages/Playlist';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { Watch } from './pages/watch/Watch';
import { MobileShell } from './mobile/MobileShell';
import { MobileYou } from './mobile/MobileYou';
import { ShortsPage } from './mobile/Shorts';
import { useIsMobile, useMobileClass } from './mobile/useIsMobile';
import { useAuth } from './stores/auth';
import { resolveTheme, useSettings } from './stores/settings';

function useThemeSync() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const apply = () => {
      const t = resolveTheme(theme);
      document.documentElement.dataset.theme = t;
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', t === 'dark' ? '#0f0f0f' : '#ffffff'));
    };
    apply();
    if (theme !== 'system') return;
    const mql = matchMedia('(prefers-color-scheme: light)');
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [theme]);
}

/**
 * Catch-all for YouTube URL shapes that aren't native routes here (youtu.be/ID, /shorts/ID,
 * /embed/ID, /attribution_link, ...): swap youtube.com for this domain and the link still works.
 */
function LinkRedirect() {
  const { pathname, search } = useLocation();
  const target = resolveYouTubeUrl(pathname + search);
  if (target && target !== pathname + search) return <Navigate to={target} replace />;
  if (pathname.startsWith('/@')) return <ChannelResolver />;
  return <NotFound />;
}

/**
 * Web Share Target (see manifest.webmanifest): sharing a video from the YouTube app or a browser to
 * the installed app lands here with the link in `url` or buried in `text`.
 */
function ShareTarget() {
  const { search } = useLocation();
  const p = new URLSearchParams(search);
  const blob = [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ');
  const link = blob.match(/https?:\/\/\S+/i)?.[0];
  const target = link ? resolveYouTubeUrl(link) : null;
  if (target) return <Navigate to={target} replace />;
  const q = (p.get('text') || p.get('title') || '').trim();
  return <Navigate to={q ? `/results?search_query=${encodeURIComponent(q)}` : '/'} replace />;
}

/** Page routes shared by the desktop and mobile shells. */
export function pageRoutes(mobile: boolean, shortsTab = false) {
  return (
    <>
      <Route index element={<Home />} />
      <Route path="watch" element={mobile ? null : <Watch />} />
      <Route path="results" element={<Search />} />
      <Route path="search" element={<Search />} />
      <Route path="playlist" element={<Playlist />} />
      <Route path="channel/:id" element={<Channel />} />
      <Route path="channel/:id/:tab" element={<Channel />} />
      <Route path="c/:name" element={<ChannelResolver />} />
      <Route path="c/:name/:tab" element={<ChannelResolver />} />
      <Route path="user/:name" element={<ChannelResolver />} />
      <Route path="user/:name/:tab" element={<ChannelResolver />} />
      <Route path="hashtag/:tag" element={<Hashtag />} />
      <Route path="feed/trending" element={<Trending />} />
      <Route path="feed/explore" element={<Trending />} />
      <Route path="feed/subscriptions" element={<Subscriptions />} />
      <Route path="feed/channels" element={<Channels />} />
      <Route path="feed/history" element={<History />} />
      <Route path="feed/playlists" element={<PlaylistsPage />} />
      <Route path="feed/library" element={mobile ? <MobileYou /> : <You />} />
      <Route path="feed/you" element={mobile ? <MobileYou /> : <You />} />
      <Route path="login" element={<Login />} />
      <Route path="settings" element={<Settings />} />
      <Route path="share" element={<ShareTarget />} />
      {mobile && shortsTab && <Route path="shorts/:id?" element={<ShortsPage />} />}
      <Route path=":handle" element={<LinkRedirect />} />
      <Route path=":handle/:tab" element={<LinkRedirect />} />
      <Route path="*" element={<LinkRedirect />} />
    </>
  );
}

export function App() {
  useThemeSync();
  const mobile = useIsMobile();
  const shortsTab = useSettings((s) => s.shortsTab);
  useMobileClass(mobile);
  const refresh = useAuth((s) => s.refresh);
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <BrowserRouter>
      {mobile ? (
        <MobileShell routes={pageRoutes(true, shortsTab)} />
      ) : (
        <Routes>
          <Route element={<AppShell />}>{pageRoutes(false)}</Route>
        </Routes>
      )}
    </BrowserRouter>
  );
}
