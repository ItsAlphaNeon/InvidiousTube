import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/invidious';
import { avatarUrl } from '../api/images';
import { resolveYouTubeUrl } from '../api/youtubeUrl';
import { useSubscriptions } from '../hooks/useAccount';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../stores/auth';
import { useLibrary } from '../stores/library';
import { SB_CATEGORIES, useSettings, type SBAction, type ThemeSetting } from '../stores/settings';
import { toast } from '../stores/ui';
import './settings.css';

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'playback', label: 'Playback and performance' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'sponsorblock', label: 'SponsorBlock' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'links', label: 'Link redirect' },
  { id: 'data', label: 'Import & export' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
];

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button className={'yt-switch' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
  );
}

function Row({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-title">{title}</div>
        {desc && <div className="settings-row-desc">{desc}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

export function Settings() {
  useDocumentTitle('Settings');
  const { hash } = useLocation();
  const [section, setSection] = useState(hash.slice(1) || 'account');
  useEffect(() => {
    if (hash) setSection(hash.slice(1));
  }, [hash]);

  return (
    <div className="settings-page">
      <nav className="settings-nav">
        <h2 className="settings-nav-title">Settings</h2>
        {SECTIONS.map((s) => (
          <button key={s.id} className={'settings-nav-item' + (section === s.id ? ' active' : '')} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {section === 'account' && <AccountSection />}
        {section === 'playback' && <PlaybackSection />}
        {section === 'appearance' && <AppearanceSection />}
        {section === 'sponsorblock' && <SponsorBlockSection />}
        {section === 'privacy' && <PrivacySection />}
        {section === 'links' && <LinksSection />}
        {section === 'data' && <DataSection />}
        {section === 'shortcuts' && <ShortcutsSection />}
      </div>
    </div>
  );
}

function AccountSection() {
  const { loggedIn, username, logout } = useAuth();
  const localSubs = useLibrary((s) => s.subscriptions);
  const { subs } = useSubscriptions();
  const qc = useQueryClient();
  const [importing, setImporting] = useState<string | null>(null);
  const { data: stats } = useQuery({ queryKey: ['inv-stats'], queryFn: () => fetch('/api/v1/stats').then((r) => r.json()), staleTime: Infinity });

  const importToAccount = async () => {
    const remote = new Set(subs.map((s) => s.authorId));
    const todo = localSubs.filter((s) => !remote.has(s.authorId));
    let done = 0;
    for (const s of todo) {
      setImporting(`Importing ${++done}/${todo.length}…`);
      await api.authSubscribe(s.authorId).catch(() => undefined);
    }
    setImporting(null);
    qc.invalidateQueries({ queryKey: ['auth'] });
    qc.invalidateQueries({ queryKey: ['feed'] });
    toast(`Imported ${todo.length} subscriptions into your Invidious account`);
  };

  return (
    <>
      <h1 className="settings-title">Account</h1>
      <p className="settings-lead">Choose how you use this frontend with your Invidious instance</p>
      <section className="settings-section">
        <h3>Your account</h3>
        {loggedIn ? (
          <>
            <Row title={`Signed in as ${username}`} desc="Subscriptions, watch history and playlists are synced with your Invidious account.">
              <button className="pill-btn" onClick={() => logout().then(() => toast('Signed out'))}>
                Sign out
              </button>
            </Row>
            {localSubs.length > 0 && (
              <Row title="Import local subscriptions" desc={`Copy the ${localSubs.length} subscriptions saved in this browser into your Invidious account.`}>
                <button className="pill-btn" disabled={!!importing} onClick={importToAccount}>
                  {importing ?? 'Import'}
                </button>
              </Row>
            )}
          </>
        ) : (
          <Row title="Not signed in" desc="Your subscriptions, history and playlists are stored only in this browser.">
            <Link to="/login" className="pill-btn blue">
              Sign in
            </Link>
          </Row>
        )}
      </section>
      <section className="settings-section">
        <h3>Instance</h3>
        <Row title="Invidious" desc={stats?.software ? `${stats.software.name} ${stats.software.version} (${stats.software.branch})` : 'Checking…'}>
          <span />
        </Row>
      </section>
    </>
  );
}

function PlaybackSection() {
  const s = useSettings();
  return (
    <>
      <h1 className="settings-title">Playback and performance</h1>
      <p className="settings-lead">Control your viewing experience</p>
      <section className="settings-section">
        <h3>Playback</h3>
        <Row title="Autoplay" desc="Automatically play the next suggested video when one ends">
          <Toggle on={s.autoplayNext} onChange={(v) => s.set({ autoplayNext: v })} />
        </Row>
        <Row title="Start playing automatically" desc="Begin playback as soon as a video page opens">
          <Toggle on={s.autoplayOnLoad} onChange={(v) => s.set({ autoplayOnLoad: v })} />
        </Row>
        <Row title="Preferred quality" desc="Upper limit for automatic quality">
          <select className="settings-select" value={String(s.quality)} onChange={(e) => s.set({ quality: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}>
            <option value="auto">Auto</option>
            {[2160, 1440, 1080, 720, 480, 360, 240, 144].map((h) => (
              <option key={h} value={h}>
                {h}p
              </option>
            ))}
          </select>
        </Row>
        <Row title="Always show captions" desc="Turn on subtitles automatically when available">
          <Toggle on={s.captions} onChange={(v) => s.set({ captions: v })} />
        </Row>
        <Row title="Caption language" desc="Preferred subtitle language code (e.g. en, de, ja)">
          <input className="text-field settings-small-input" value={s.captionLang} onChange={(e) => s.set({ captionLang: e.target.value.trim() })} />
        </Row>
        <Row title="Hide Shorts" desc="Keep YouTube Shorts out of your home feed, subscriptions, search, recommendations and autoplay">
          <Toggle on={s.hideShorts} onChange={(v) => s.set({ hideShorts: v })} />
        </Row>
        <Row title="Inline playback" desc="Preview videos when hovering over thumbnails">
          <Toggle on={s.hoverPreview} onChange={(v) => s.set({ hoverPreview: v })} />
        </Row>
        <Row title="Ambient mode" desc="Soft glow of the video's colours behind the player (dark theme)">
          <Toggle on={s.ambientMode} onChange={(v) => s.set({ ambientMode: v })} />
        </Row>
        <Row title="Return YouTube Dislike" desc="Show estimated dislike counts from returnyoutubedislikeapi.com">
          <Toggle on={s.ryd} onChange={(v) => s.set({ ryd: v })} />
        </Row>
      </section>
    </>
  );
}

const THEMES: { id: ThemeSetting; label: string }[] = [
  { id: 'system', label: 'Use device theme' },
  { id: 'dark', label: 'Dark theme' },
  { id: 'light', label: 'Light theme' },
];

function AppearanceSection() {
  const s = useSettings();
  return (
    <>
      <h1 className="settings-title">Appearance</h1>
      <p className="settings-lead">Choose how the site looks in this browser</p>
      <section className="settings-section">
        <h3>Theme</h3>
        {THEMES.map((t) => (
          <label key={t.id} className="settings-radio">
            <input type="radio" name="theme" checked={s.theme === t.id} onChange={() => s.set({ theme: t.id })} />
            {t.label}
          </label>
        ))}
      </section>
      <section className="settings-section">
        <h3>Location & branding</h3>
        <Row title="Region" desc="Country used for Trending and search (ISO code)">
          <input className="text-field settings-small-input" maxLength={2} value={s.region} onChange={(e) => s.set({ region: e.target.value.toUpperCase() })} />
        </Row>
        <Row title="Site name" desc="Wordmark shown next to the logo and in the tab title">
          <input className="text-field settings-input" value={s.brand} onChange={(e) => s.set({ brand: e.target.value || 'YouTube' })} />
        </Row>
      </section>
    </>
  );
}

const SB_ACTIONS: { id: SBAction; label: string }[] = [
  { id: 'skip', label: 'Auto skip' },
  { id: 'manual', label: 'Show skip button' },
  { id: 'show', label: 'Show in seek bar' },
  { id: 'off', label: 'Disable' },
];

function SponsorBlockSection() {
  const s = useSettings();
  return (
    <>
      <h1 className="settings-title">SponsorBlock</h1>
      <p className="settings-lead">
        Skip sponsorships and other segments submitted by the{' '}
        <a href="https://sponsor.ajay.app" target="_blank" rel="noreferrer">
          SponsorBlock
        </a>{' '}
        community. Only a 4-character hash prefix of the video ID is sent.
      </p>
      <section className="settings-section">
        <Row title="Enable SponsorBlock" desc="Show segments on the progress bar and skip them as configured below">
          <Toggle on={s.sponsorblock} onChange={(v) => s.set({ sponsorblock: v })} />
        </Row>
      </section>
      <section className="settings-section">
        <h3>Categories</h3>
        {SB_CATEGORIES.map((c) => (
          <Row
            key={c.id}
            title={c.label}
            desc={
              <>
                <span className="sb-swatch" style={{ background: c.color }} />
                {c.description}
              </>
            }
          >
            <select className="settings-select" value={s.sbCategories[c.id]} onChange={(e) => s.setSB(c.id, e.target.value as SBAction)} disabled={!s.sponsorblock}>
              {SB_ACTIONS.filter((a) => c.id !== 'poi_highlight' || a.id === 'show' || a.id === 'off').map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Row>
        ))}
      </section>
    </>
  );
}

function PrivacySection() {
  const lib = useLibrary();
  return (
    <>
      <h1 className="settings-title">Privacy</h1>
      <p className="settings-lead">Manage what is stored in this browser</p>
      <section className="settings-section">
        <Row title="Pause watch history" desc="Videos you watch won't be added to history or resume positions">
          <Toggle on={lib.historyPaused} onChange={lib.setHistoryPaused} />
        </Row>
        <Row title="Clear watch history" desc={`${lib.history.length} videos in this browser`}>
          <button className="pill-btn" onClick={() => (lib.clearHistory(), toast('Watch history cleared'))}>
            Clear
          </button>
        </Row>
        <Row title="Clear search history" desc={`${lib.searchHistory.length} searches`}>
          <button className="pill-btn" onClick={() => (useLibrary.setState({ searchHistory: [] }), toast('Search history cleared'))}>
            Clear
          </button>
        </Row>
        <Row title="Reset “Not interested”" desc={`${lib.notInterested.length} hidden videos`}>
          <button className="pill-btn" onClick={() => (useLibrary.setState({ notInterested: [] }), toast('Hidden videos restored'))}>
            Reset
          </button>
        </Row>
      </section>
    </>
  );
}

function LinksSection() {
  const origin = location.origin;
  const host = location.host;
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  const target = input.trim() ? resolveYouTubeUrl(/^https?:/i.test(input.trim()) ? input.trim() : `https://${input.trim()}`) : null;
  const bookmarklet =
    `javascript:(()=>{const u=new URL(location.href);` +
    String.raw`if(/(^|\.)youtube(-nocookie)?\.com$|^youtu\.be$/.test(u.hostname))` +
    `location.href=${JSON.stringify(origin)}+u.pathname+u.search;` +
    `else alert('Not a YouTube page');})()`;
  // React refuses javascript: hrefs in JSX, so set it directly on the element
  useEffect(() => {
    bookmarkletRef.current?.setAttribute('href', bookmarklet);
  }, [bookmarklet]);

  return (
    <>
      <h1 className="settings-title">Link redirect</h1>
      <p className="settings-lead">Open any YouTube link here by swapping the domain</p>
      <section className="settings-section">
        <h3>Swap the domain</h3>
        <p className="settings-row-desc" style={{ fontSize: 14, lineHeight: '20px' }}>
          Replace <code>www.youtube.com</code> or <code>youtu.be</code> with <code>{host}</code> and keep the rest of the link. Videos, Shorts, live
          streams, playlists, channels (<code>/@handle</code>, <code>/channel/…</code>), searches and timestamps all carry over.
        </p>
        <table className="shortcuts-table link-examples">
          <tbody>
            {[
              ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42', `${origin}/watch?v=dQw4w9WgXcQ&t=42`],
              ['https://youtu.be/dQw4w9WgXcQ', `${origin}/dQw4w9WgXcQ`],
              ['https://www.youtube.com/shorts/…', `${origin}/shorts/…`],
              ['https://www.youtube.com/@LinusTechTips', `${origin}/@LinusTechTips`],
            ].map(([a, b]) => (
              <tr key={a}>
                <td>{a}</td>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="settings-section">
        <h3>Convert a link</h3>
        <div className="link-convert">
          <input
            className="text-field"
            placeholder="Paste a YouTube link"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && target && navigate(target)}
          />
          <button className="pill-btn blue" disabled={!target} onClick={() => target && navigate(target)}>
            Open
          </button>
        </div>
        {input.trim() && (
          <div className="settings-row-desc" style={{ marginTop: 8 }}>
            {target ? (
              <>
                Opens <code>{origin + target}</code>
                <button
                  className="pill-btn text sm"
                  style={{ marginLeft: 8 }}
                  onClick={() => navigator.clipboard?.writeText(origin + target).then(() => toast('Link copied to clipboard'))}
                >
                  Copy
                </button>
              </>
            ) : (
              "That doesn't look like a YouTube link this site can open."
            )}
          </div>
        )}
      </section>
      <section className="settings-section">
        <h3>Bookmarklet</h3>
        <Row title="Open YouTube pages here" desc="Drag this button to your bookmarks bar, then click it on any youtube.com page to open the same page here.">
          <a ref={bookmarkletRef} className="pill-btn filled" onClick={(e) => e.preventDefault()} draggable>
            Open in {useSettings.getState().brand}
          </a>
        </Row>
      </section>
    </>
  );
}

/** Parses subscription exports from YouTube Takeout (CSV), NewPipe/Invidious (JSON) and FreeTube/RSS (OPML). */
function parseSubscriptionFile(name: string, text: string): { authorId: string; author: string }[] {
  const out: { authorId: string; author: string }[] = [];
  const add = (id?: string | null, author?: string | null) => {
    if (id && /^UC[\w-]{22}$/.test(id)) out.push({ authorId: id, author: author || id });
  };
  const idFromUrl = (u: string) => u.match(/(UC[\w-]{22})/)?.[1];
  if (/\.csv$/i.test(name) || /^Channel Id,/i.test(text)) {
    for (const line of text.split(/\r?\n/).slice(1)) {
      const [id, , title] = line.split(',');
      add(id?.trim(), title?.trim());
    }
    return out;
  }
  if (/\.(opml|xml)$/i.test(name) || text.trim().startsWith('<')) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    doc.querySelectorAll('outline').forEach((o) => add(idFromUrl(o.getAttribute('xmlUrl') || ''), o.getAttribute('title') || o.getAttribute('text')));
    return out;
  }
  const json = JSON.parse(text);
  if (Array.isArray(json?.subscriptions)) {
    for (const s of json.subscriptions) {
      if (typeof s === 'string') add(s, null);
      else add(idFromUrl(s.url || '') || s.id, s.name || s.author);
    }
  } else if (json?.state?.subscriptions) {
    for (const s of json.state.subscriptions) add(s.authorId, s.author);
  } else if (Array.isArray(json)) {
    for (const s of json) add(s.authorId || idFromUrl(s.url || ''), s.author || s.name);
  }
  return out;
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const exportData = () => {
    const { subscriptions, history, watchLater, liked, playlists, searchHistory } = useLibrary.getState();
    const blob = new Blob([JSON.stringify({ app: 'invidioustube', version: 1, subscriptions, history, watchLater, liked, playlists, searchHistory }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `invidioustube-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = async (f: File) => {
    const text = await f.text();
    try {
      const json = f.name.endsWith('.json') ? JSON.parse(text) : null;
      if (json?.app === 'invidioustube') {
        useLibrary.setState({
          subscriptions: json.subscriptions ?? [],
          history: json.history ?? [],
          watchLater: json.watchLater ?? [],
          liked: json.liked ?? [],
          playlists: json.playlists ?? [],
          searchHistory: json.searchHistory ?? [],
        });
        toast('Library restored from backup');
        return;
      }
      const subs = parseSubscriptionFile(f.name, text);
      if (!subs.length) {
        toast('No subscriptions found in that file');
        return;
      }
      // Fill in channel names for exports that only contain IDs
      const unnamed = subs.filter((s) => s.author === s.authorId);
      let i = 0;
      for (const s of unnamed) {
        setStatus(`Looking up channel names ${++i}/${unnamed.length}…`);
        try {
          const r = await fetch(`/api/v1/channels/${s.authorId}?fields=author,authorThumbnails`).then((x) => x.json());
          if (r?.author) s.author = r.author;
          (s as { thumbnail?: string }).thumbnail = r?.authorThumbnails ? avatarUrl(r.authorThumbnails, 48) : undefined;
        } catch {
          /* keep id */
        }
      }
      setStatus(null);
      const n = useLibrary.getState().importSubscriptions(subs);
      toast(`Imported ${n} new subscriptions`);
    } catch (e) {
      setStatus(null);
      toast(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <h1 className="settings-title">Import & export</h1>
      <p className="settings-lead">Move your subscriptions and library between devices and apps</p>
      <section className="settings-section">
        <Row
          title="Import subscriptions"
          desc="YouTube Takeout (subscriptions.csv), NewPipe or Invidious export (.json), FreeTube/RSS (.opml), or an InvidiousTube backup"
        >
          <input ref={fileRef} type="file" accept=".csv,.json,.opml,.xml" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button className="pill-btn" onClick={() => fileRef.current?.click()} disabled={!!status}>
            {status ?? 'Choose file'}
          </button>
        </Row>
        <Row title="Export library" desc="Download subscriptions, history, playlists and likes stored in this browser">
          <button className="pill-btn" onClick={exportData}>
            Export
          </button>
        </Row>
      </section>
    </>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Toggle play/pause', 'k / Space'],
  ['Rewind 10 seconds', 'j'],
  ['Fast forward 10 seconds', 'l'],
  ['Seek backward 5 seconds', '←'],
  ['Seek forward 5 seconds', '→'],
  ['Increase / decrease volume 5%', '↑ / ↓ (player focused)'],
  ['Mute / unmute', 'm'],
  ['Full screen', 'f'],
  ['Theater mode', 't'],
  ['Miniplayer', 'i'],
  ['Subtitles / closed captions', 'c'],
  ['Seek to 0%–90%', '0 – 9'],
  ['Previous / next frame (paused)', ', / .'],
  ['Decrease / increase playback rate', '< / >'],
  ['Next video', 'Shift + N'],
  ['Previous video (playlist)', 'Shift + P'],
  ['Seek to beginning / end', 'Home / End'],
];

function ShortcutsSection() {
  return (
    <>
      <h1 className="settings-title">Keyboard shortcuts</h1>
      <p className="settings-lead">The same shortcuts you know from YouTube</p>
      <section className="settings-section">
        <table className="shortcuts-table">
          <tbody>
            {SHORTCUTS.map(([a, k]) => (
              <tr key={a}>
                <td>{a}</td>
                <td>
                  <kbd>{k}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
