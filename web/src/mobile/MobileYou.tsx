import { Link } from 'react-router-dom';
import { formatDuration } from '../api/format';
import { videoThumb } from '../api/images';
import { Avatar } from '../components/common/Avatar';
import { useMyPlaylists } from '../hooks/useAccount';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Icon, type IconName } from '../icons';
import { useAuth } from '../stores/auth';
import { useLibrary, useWatchProgress, type VideoLite } from '../stores/library';
import { resolveTheme, useSettings } from '../stores/settings';
import { toast } from '../stores/ui';
import { isStandalone } from './useIsMobile';

/** The app's "You" tab: account header, history and playlist shelves, then a list of shortcuts. */
export function MobileYou() {
  useDocumentTitle('You');
  const username = useAuth((s) => s.username);
  const loggedIn = useAuth((s) => s.loggedIn);
  const logout = useAuth((s) => s.logout);
  const history = useLibrary((s) => s.history);
  const watchLater = useLibrary((s) => s.watchLater);
  const liked = useLibrary((s) => s.liked);
  const { playlists } = useMyPlaylists();
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  const dark = resolveTheme(theme) === 'dark';

  return (
    <div className="m-you">
      <div className="m-you-header">
        <Avatar name={username || 'You'} size={64} />
        <div className="m-you-id">
          <h1>{loggedIn ? username : 'You'}</h1>
          {loggedIn ? (
            <span className="secondary">Signed in with Invidious</span>
          ) : (
            <Link to="/login" className="m-you-signin">
              Sign in to sync your library <Icon name="chevronRight" size={16} />
            </Link>
          )}
        </div>
      </div>

      <Shelf title="History" to="/feed/history">
        {history.slice(0, 20).map((v) => (
          <ShelfVideo key={v.videoId} v={v} />
        ))}
      </Shelf>

      <Shelf title="Playlists" to="/feed/playlists">
        <ShelfPlaylist to="/playlist?list=WL" title="Watch later" sub={`${watchLater.length} videos`} thumb={watchLater[0]?.videoId} />
        <ShelfPlaylist to="/playlist?list=LL" title="Liked videos" sub={`${liked.length} videos`} thumb={liked[0]?.videoId} />
        {playlists.map((p) => (
          <ShelfPlaylist key={p.id} to={`/playlist?list=${p.id}`} title={p.title} sub={`${p.videoCount} videos`} thumb={p.firstVideoId} />
        ))}
      </Shelf>

      <div className="m-you-list">
        <ListLink to="/playlist?list=WL" icon="watchLater" label="Watch later" />
        <ListLink to="/playlist?list=LL" icon="like" label="Liked videos" />
        <ListLink to="/feed/channels" icon="subscriptions" label="Your subscriptions" />
        <div className="m-you-divider" />
        <button className="m-you-item" onClick={() => set({ theme: dark ? 'light' : 'dark' })}>
          <Icon name="appearance" />
          <span>Appearance: {theme === 'system' ? 'Device theme' : dark ? 'Dark' : 'Light'}</span>
        </button>
        <ListLink to="/settings" icon="settings" label="Settings" />
        <button
          className="m-you-item"
          onClick={() => {
            set({ layout: 'desktop' });
            toast('Switched to the desktop layout (change it back in Settings)');
          }}
        >
          <Icon name="yourVideos" />
          <span>Use desktop layout</span>
        </button>
        {!isStandalone() && <InstallHint />}
        {loggedIn && (
          <button className="m-you-item" onClick={() => logout()}>
            <Icon name="signOut" />
            <span>Sign out</span>
          </button>
        )}
      </div>
    </div>
  );
}

function InstallHint() {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (
    <button
      className="m-you-item"
      onClick={() =>
        toast(ios ? 'Tap Share, then "Add to Home Screen" to install the app' : 'Open the browser menu and choose "Install app" or "Add to Home screen"', { duration: 7000 })
      }
    >
      <Icon name="download" />
      <span>Install as an app</span>
    </button>
  );
}

function Shelf({ title, to, children }: { title: string; to: string; children: React.ReactNode }) {
  const empty = Array.isArray(children) ? children.flat().filter(Boolean).length === 0 : !children;
  return (
    <section className="m-shelf">
      <div className="m-shelf-head">
        <h2>{title}</h2>
        <Link to={to} className="m-shelf-all">
          View all
        </Link>
      </div>
      {empty ? <div className="m-shelf-empty">Nothing here yet</div> : <div className="m-shelf-row">{children}</div>}
    </section>
  );
}

function ShelfVideo({ v }: { v: VideoLite }) {
  const progress = useWatchProgress(v.videoId, v.lengthSeconds);
  return (
    <Link to={`/watch?v=${v.videoId}`} className="m-shelf-item">
      <div className="m-shelf-thumb">
        <img src={videoThumb(v.videoId, 'mqdefault')} alt="" />
        {v.lengthSeconds > 0 && <span className="thumb-badge">{formatDuration(v.lengthSeconds)}</span>}
        {progress > 0 && (
          <div className="thumb-progress">
            <div style={{ width: `${Math.max(progress * 100, 3)}%` }} />
          </div>
        )}
      </div>
      <div className="m-shelf-title clamp-2">{v.title}</div>
      <div className="m-shelf-sub">{v.author}</div>
    </Link>
  );
}

function ShelfPlaylist({ to, title, sub, thumb }: { to: string; title: string; sub: string; thumb?: string }) {
  return (
    <Link to={to} className="m-shelf-item">
      <div className="m-shelf-thumb playlist">
        {thumb ? <img src={videoThumb(thumb, 'mqdefault')} alt="" /> : <div className="m-shelf-thumb-empty" />}
        <span className="thumb-badge">
          <Icon name="playlists" size={14} />
        </span>
      </div>
      <div className="m-shelf-title clamp-2">{title}</div>
      <div className="m-shelf-sub">{sub}</div>
    </Link>
  );
}

function ListLink({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <Link to={to} className="m-you-item">
      <Icon name={icon} />
      <span>{label}</span>
    </Link>
  );
}
