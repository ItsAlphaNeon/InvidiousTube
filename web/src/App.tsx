import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
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
import { useAuth } from './stores/auth';
import { resolveTheme, useSettings } from './stores/settings';

function useThemeSync() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const apply = () => {
      const t = resolveTheme(theme);
      document.documentElement.dataset.theme = t;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0f0f0f' : '#ffffff');
    };
    apply();
    if (theme !== 'system') return;
    const mql = matchMedia('(prefers-color-scheme: light)');
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [theme]);
}

/** youtu.be/ID, /shorts/ID, /embed/ID, /live/ID → /watch */
function ShortWatchRedirect() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const t = params.get('t');
  return <Navigate to={`/watch?v=${id}${t ? `&t=${t}` : ''}`} replace />;
}

export function App() {
  useThemeSync();
  const refresh = useAuth((s) => s.refresh);
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="watch" element={<Watch />} />
          <Route path="results" element={<Search />} />
          <Route path="search" element={<Search />} />
          <Route path="playlist" element={<Playlist />} />
          <Route path="channel/:id" element={<Channel />} />
          <Route path="channel/:id/:tab" element={<Channel />} />
          <Route path="c/:name" element={<ChannelResolver />} />
          <Route path="c/:name/:tab" element={<ChannelResolver />} />
          <Route path="user/:name" element={<ChannelResolver />} />
          <Route path="hashtag/:tag" element={<Hashtag />} />
          <Route path="feed/trending" element={<Trending />} />
          <Route path="feed/explore" element={<Trending />} />
          <Route path="feed/subscriptions" element={<Subscriptions />} />
          <Route path="feed/channels" element={<Channels />} />
          <Route path="feed/history" element={<History />} />
          <Route path="feed/playlists" element={<PlaylistsPage />} />
          <Route path="feed/library" element={<You />} />
          <Route path="feed/you" element={<You />} />
          <Route path="shorts/:id" element={<ShortWatchRedirect />} />
          <Route path="embed/:id" element={<ShortWatchRedirect />} />
          <Route path="live/:id" element={<ShortWatchRedirect />} />
          <Route path="login" element={<Login />} />
          <Route path="settings" element={<Settings />} />
          <Route path=":handle" element={<HandleRoute />} />
          <Route path=":handle/:tab" element={<HandleRoute />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

/** "/@handle" routes; any other single-segment path is either an 11-char video ID (youtu.be style) or a 404. */
function HandleRoute() {
  const { handle = '' } = useParams();
  if (handle.startsWith('@')) return <ChannelResolver />;
  if (/^[\w-]{11}$/.test(handle)) return <Navigate to={`/watch?v=${handle}`} replace />;
  return <NotFound />;
}
