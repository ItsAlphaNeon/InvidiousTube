import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/invidious';
import { toCard } from '../components/cards/model';
import { RichGrid } from '../components/cards/RichGrid';
import { PlaylistCardGrid, VideoCardGrid, VideoCardList } from '../components/cards/VideoCards';
import { Avatar } from '../components/common/Avatar';
import { ConfirmDialog } from '../components/common/Modal';
import { useMyPlaylists, usePlaylistActions } from '../hooks/useAccount';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Icon } from '../icons';
import { useAuth } from '../stores/auth';
import { useLibrary, type HistoryEntry } from '../stores/library';
import { toast } from '../stores/ui';
import './library.css';

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  if (d.getFullYear() === today.getFullYear()) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function History() {
  useDocumentTitle('Watch history');
  const history = useLibrary((s) => s.history);
  const paused = useLibrary((s) => s.historyPaused);
  const setPaused = useLibrary((s) => s.setHistoryPaused);
  const clear = useLibrary((s) => s.clearHistory);
  const remove = useLibrary((s) => s.removeHistory);
  const loggedIn = useAuth((s) => s.loggedIn);
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<'clear' | 'pause' | null>(null);
  const [limit, setLimit] = useState(100);

  // Account history (IDs only) — show videos watched on other devices that are not in local history
  const remote = useQuery({ queryKey: ['auth', 'history'], queryFn: () => api.authHistory(1, 100), enabled: loggedIn, staleTime: 60_000 });
  const localIds = useMemo(() => new Set(history.map((h) => h.videoId)), [history]);
  const missing = (remote.data || []).filter((id) => !localIds.has(id)).slice(0, 30);
  const remoteDetails = useQueries({
    queries: missing.map((id) => ({ queryKey: ['video-lite', id], queryFn: () => api.videoLite(id), staleTime: Infinity, retry: false })),
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? history.filter((h) => h.title.toLowerCase().includes(t) || h.author.toLowerCase().includes(t)) : history;
  }, [history, q]);

  const groups = useMemo(() => {
    const out: { label: string; items: HistoryEntry[] }[] = [];
    for (const h of filtered.slice(0, limit)) {
      const label = dayLabel(h.watchedAt);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(h);
    }
    return out;
  }, [filtered, limit]);

  return (
    <div className="history-page">
      <div className="history-main">
        <h1 className="feed-title-lg">Watch history</h1>
        {!history.length && !missing.length && (
          <div className="history-empty">{paused ? 'Watch history is paused.' : 'This list has no videos.'}</div>
        )}
        {groups.map((g) => (
          <section key={g.label} className="history-group">
            <h2 className="history-group-title">{g.label}</h2>
            {g.items.map((h) => (
              <div key={h.videoId} className="history-item">
                <VideoCardList v={toCard(h)} size="md" showDescription={false} />
                <button
                  className="icon-btn history-remove"
                  data-tooltip="Remove from watch history"
                  onClick={() => {
                    remove(h.videoId);
                    if (loggedIn) api.authDeleteHistory(h.videoId).catch(() => undefined);
                    toast('Removed from watch history', { action: { label: 'Undo', onClick: () => useLibrary.getState().recordWatch(h, h.position) } });
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </section>
        ))}
        {filtered.length > limit && (
          <button className="pill-btn" style={{ margin: '16px 0' }} onClick={() => setLimit((l) => l + 100)}>
            Show more
          </button>
        )}
        {loggedIn && remoteDetails.some((r) => r.data) && (
          <section className="history-group">
            <h2 className="history-group-title">From your Invidious account</h2>
            {remoteDetails.map((r, i) => (r.data ? <VideoCardList key={missing[i]} v={toCard(r.data)} size="md" showDescription={false} /> : null))}
          </section>
        )}
      </div>
      <aside className="history-side">
        <div className="history-search">
          <Icon name="search" />
          <input placeholder="Search watch history" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="history-action" onClick={() => setConfirm('clear')}>
          <Icon name="trash" />
          Clear all watch history
        </button>
        <button className="history-action" onClick={() => (paused ? setPaused(false) : setConfirm('pause'))}>
          <Icon name={paused ? 'play' : 'notInterested'} />
          {paused ? 'Turn on watch history' : 'Pause watch history'}
        </button>
        <Link to="/settings" className="history-action">
          <Icon name="settings" />
          Manage all history
        </Link>
      </aside>
      {confirm === 'clear' && (
        <ConfirmDialog
          message={
            <>
              <h3 style={{ fontSize: 20, marginBottom: 12 }}>Clear watch history?</h3>
              Your watch history in this browser will be cleared{loggedIn ? ', and your Invidious account history too' : ''}.
            </>
          }
          confirmLabel="Clear watch history"
          onConfirm={() => {
            clear();
            if (loggedIn) api.authClearHistory().then(() => remote.refetch()).catch(() => undefined);
            toast('Watch history cleared');
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'pause' && (
        <ConfirmDialog
          message={
            <>
              <h3 style={{ fontSize: 20, marginBottom: 12 }}>Pause watch history?</h3>
              Videos you watch while history is paused won't show up here, and you won't be able to resume where you left off.
            </>
          }
          confirmLabel="Pause"
          onConfirm={() => setPaused(true)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

export function PlaylistsPage() {
  useDocumentTitle('Playlists');
  const { playlists, isLoading } = useMyPlaylists();
  const watchLater = useLibrary((s) => s.watchLater);
  const liked = useLibrary((s) => s.liked);
  const actions = usePlaylistActions();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  return (
    <div className="feed-page">
      <div className="feed-header">
        <h1 className="feed-title-lg">Playlists</h1>
        <button className="pill-btn icon-leading" onClick={() => setCreating(true)}>
          <Icon name="add" />
          New playlist
        </button>
      </div>
      {creating && (
        <form
          className="new-playlist-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await actions.create(name.trim(), 'private');
            setName('');
            setCreating(false);
            toast('Playlist created');
          }}
        >
          <input className="text-field" autoFocus placeholder="Playlist name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="pill-btn filled" type="submit">
            Create
          </button>
          <button className="pill-btn text" type="button" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </form>
      )}
      <RichGrid minItem={210} maxCols={6}>
        <PlaylistCardGrid p={{ title: 'Watch later', playlistId: 'WL', videoCount: watchLater.length, videos: watchLater }} subtitle={<span>Private</span>} />
        <PlaylistCardGrid p={{ title: 'Liked videos', playlistId: 'LL', videoCount: liked.length, videos: liked }} subtitle={<span>Private</span>} />
        {playlists.map((p) => (
          <PlaylistCardGrid
            key={p.id}
            p={{ title: p.title, playlistId: p.id, videoCount: p.videoCount, videos: p.firstVideoId ? [{ videoId: p.firstVideoId }] : [] }}
            subtitle={<span style={{ textTransform: 'capitalize' }}>{p.privacy}</span>}
          />
        ))}
      </RichGrid>
      {isLoading && <div className="error-box">Loading playlists…</div>}
    </div>
  );
}

export function You() {
  useDocumentTitle('You');
  const username = useAuth((s) => s.username);
  const loggedIn = useAuth((s) => s.loggedIn);
  const history = useLibrary((s) => s.history);
  const watchLater = useLibrary((s) => s.watchLater);
  const liked = useLibrary((s) => s.liked);
  const { playlists } = useMyPlaylists();
  return (
    <div className="you-page">
      <div className="you-header">
        <Avatar name={username || 'You'} size={120} />
        <div>
          <h1 className="feed-title-lg">{loggedIn ? username : 'You'}</h1>
          <div className="secondary">{loggedIn ? 'Signed in with your Invidious account' : 'Your library is stored in this browser'}</div>
          {!loggedIn && (
            <Link to="/login" className="pill-btn outline sm icon-leading" style={{ marginTop: 12 }}>
              <Icon name="account" />
              Sign in to sync
            </Link>
          )}
        </div>
      </div>
      <Shelf title="History" link="/feed/history" icon="history">
        {history.slice(0, 12).map((h) => (
          <VideoCardGrid key={h.videoId} v={toCard(h)} showAvatar={false} />
        ))}
      </Shelf>
      <Shelf title="Playlists" link="/feed/playlists" icon="playlists">
        <PlaylistCardGrid p={{ title: 'Watch later', playlistId: 'WL', videoCount: watchLater.length, videos: watchLater }} subtitle={<span>Private</span>} />
        <PlaylistCardGrid p={{ title: 'Liked videos', playlistId: 'LL', videoCount: liked.length, videos: liked }} subtitle={<span>Private</span>} />
        {playlists.slice(0, 10).map((p) => (
          <PlaylistCardGrid
            key={p.id}
            p={{ title: p.title, playlistId: p.id, videoCount: p.videoCount, videos: p.firstVideoId ? [{ videoId: p.firstVideoId }] : [] }}
            subtitle={<span style={{ textTransform: 'capitalize' }}>{p.privacy}</span>}
          />
        ))}
      </Shelf>
      <Shelf title="Watch later" link="/playlist?list=WL" icon="watchLater" count={watchLater.length}>
        {watchLater.slice(0, 12).map((v) => (
          <VideoCardGrid key={v.videoId} v={toCard(v)} showAvatar={false} />
        ))}
      </Shelf>
      <Shelf title="Liked videos" link="/playlist?list=LL" icon="like" count={liked.length}>
        {liked.slice(0, 12).map((v) => (
          <VideoCardGrid key={v.videoId} v={toCard(v)} showAvatar={false} />
        ))}
      </Shelf>
    </div>
  );
}

function Shelf({ title, link, icon, count, children }: { title: string; link: string; icon: Parameters<typeof Icon>[0]['name']; count?: number; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children.flat().filter(Boolean) : [children];
  return (
    <section className="you-shelf">
      <div className="you-shelf-header">
        <Link to={link} className="you-shelf-title">
          <Icon name={icon} />
          <h2>{title}</h2>
          {count != null && <span className="secondary">{count}</span>}
        </Link>
        <Link to={link} className="pill-btn outline-grey sm">
          View all
        </Link>
      </div>
      {arr.length ? (
        <RichGrid minItem={210} maxCols={6} className="you-grid">
          {children}
        </RichGrid>
      ) : (
        <div className="you-empty">Nothing here yet.</div>
      )}
    </section>
  );
}
