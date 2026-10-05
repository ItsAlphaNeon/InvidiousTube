import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useChannelAvatar, useSubscriptions, type SubInfo } from '../../hooks/useAccount';
import { Icon, Logo, type IconName } from '../../icons';
import { useSettings } from '../../stores/settings';
import { Avatar } from '../common/Avatar';

interface Entry {
  to: string;
  label: string;
  icon: IconName;
  activeIcon?: IconName;
  match?: (path: string, search: string) => boolean;
}

const MAIN: Entry[] = [
  { to: '/', label: 'Home', icon: 'home', activeIcon: 'homeFilled', match: (p) => p === '/' },
  { to: '/feed/subscriptions', label: 'Subscriptions', icon: 'subscriptions', activeIcon: 'subscriptionsFilled' },
];

const YOU: Entry[] = [
  { to: '/feed/history', label: 'History', icon: 'history' },
  { to: '/feed/playlists', label: 'Playlists', icon: 'playlists' },
  { to: '/playlist?list=WL', label: 'Watch later', icon: 'watchLater', match: (p, s) => p === '/playlist' && s.includes('list=WL') },
  { to: '/playlist?list=LL', label: 'Liked videos', icon: 'like', match: (p, s) => p === '/playlist' && s.includes('list=LL') },
];

const EXPLORE: Entry[] = [
  { to: '/feed/trending', label: 'Trending', icon: 'trending', match: (p, s) => p === '/feed/trending' && !s.includes('type=') },
  { to: '/feed/trending?type=music', label: 'Music', icon: 'music', match: (p, s) => p === '/feed/trending' && s.includes('type=music') },
  { to: '/feed/trending?type=gaming', label: 'Gaming', icon: 'gaming', match: (p, s) => p === '/feed/trending' && s.includes('type=gaming') },
  { to: '/feed/trending?type=news', label: 'News', icon: 'news', match: (p, s) => p === '/feed/trending' && s.includes('type=news') },
  { to: '/feed/trending?type=movies', label: 'Movies', icon: 'movies', match: (p, s) => p === '/feed/trending' && s.includes('type=movies') },
];

function useIsActive() {
  const { pathname, search } = useLocation();
  return (e: Entry) => (e.match ? e.match(pathname, search) : pathname === e.to);
}

function GuideItem({ e, onNavigate }: { e: Entry; onNavigate?: () => void }) {
  const isActive = useIsActive()(e);
  return (
    <Link to={e.to} className={'guide-entry' + (isActive ? ' active' : '')} onClick={onNavigate} title={e.label}>
      <Icon name={isActive && e.activeIcon ? e.activeIcon : e.icon} />
      <span className="guide-entry-label">{e.label}</span>
    </Link>
  );
}

function SubEntry({ s, onNavigate }: { s: SubInfo; onNavigate?: () => void }) {
  const avatar = useChannelAvatar(s.authorId, s.thumbnail);
  const { pathname } = useLocation();
  const active = pathname === `/channel/${s.authorId}` || pathname.startsWith(`/channel/${s.authorId}/`);
  return (
    <Link to={`/channel/${s.authorId}`} className={'guide-entry' + (active ? ' active' : '')} onClick={onNavigate} title={s.author}>
      <Avatar src={avatar} name={s.author} size={24} />
      <span className="guide-entry-label">{s.author}</span>
    </Link>
  );
}

export function GuideContent({ onNavigate }: { onNavigate?: () => void }) {
  const { subs } = useSubscriptions();
  const [showAll, setShowAll] = useState(false);
  const sorted = [...subs].sort((a, b) => a.author.localeCompare(b.author));
  const visible = showAll ? sorted : sorted.slice(0, 7);
  const isActive = useIsActive();
  const youActive = isActive({ to: '/feed/you', label: '', icon: 'library' });
  return (
    <nav className="guide-content">
      <div className="guide-section">
        {MAIN.map((e) => (
          <GuideItem key={e.to} e={e} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="guide-section">
        <Link to="/feed/you" className={'guide-entry guide-you' + (youActive ? ' active' : '')} onClick={onNavigate}>
          <span className="guide-you-title">You</span>
          <Icon name="chevronRight" size={16} />
        </Link>
        {YOU.map((e) => (
          <GuideItem key={e.to} e={e} onNavigate={onNavigate} />
        ))}
      </div>
      {subs.length > 0 && (
        <div className="guide-section">
          <h3 className="guide-section-title">Subscriptions</h3>
          {visible.map((s) => (
            <SubEntry key={s.authorId} s={s} onNavigate={onNavigate} />
          ))}
          {sorted.length > 7 && (
            <button className="guide-entry" onClick={() => setShowAll((v) => !v)}>
              <Icon name={showAll ? 'chevronUp' : 'chevronDown'} />
              <span className="guide-entry-label">{showAll ? 'Show fewer' : `Show ${sorted.length - 7} more`}</span>
            </button>
          )}
          <Link to="/feed/channels" className="guide-entry" onClick={onNavigate}>
            <Icon name="playlists" />
            <span className="guide-entry-label">All subscriptions</span>
          </Link>
        </div>
      )}
      <div className="guide-section">
        <h3 className="guide-section-title">Explore</h3>
        {EXPLORE.map((e) => (
          <GuideItem key={e.to} e={e} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="guide-section">
        <GuideItem e={{ to: '/settings', label: 'Settings', icon: 'settings' }} onNavigate={onNavigate} />
        <GuideItem e={{ to: '/settings#shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard', match: () => false }} onNavigate={onNavigate} />
      </div>
      <footer className="guide-footer">
        <div className="guide-footer-links">
          <a href="https://invidious.io" target="_blank" rel="noreferrer">
            About Invidious
          </a>
          <a href="https://github.com/iv-org/invidious" target="_blank" rel="noreferrer">
            Source
          </a>
          <a href="https://sponsor.ajay.app" target="_blank" rel="noreferrer">
            SponsorBlock
          </a>
          <a href="https://returnyoutubedislike.com" target="_blank" rel="noreferrer">
            Return YouTube Dislike
          </a>
        </div>
        <div className="guide-copyright">InvidiousTube · A private frontend for your Invidious instance</div>
      </footer>
    </nav>
  );
}

export function FullGuide() {
  return (
    <aside className="guide guide-full">
      <GuideContent />
    </aside>
  );
}

const MINI: Entry[] = [
  { to: '/', label: 'Home', icon: 'home', activeIcon: 'homeFilled', match: (p) => p === '/' },
  { to: '/feed/subscriptions', label: 'Subscriptions', icon: 'subscriptions', activeIcon: 'subscriptionsFilled' },
  { to: '/feed/you', label: 'You', icon: 'library' },
  { to: '/feed/history', label: 'History', icon: 'history' },
];

export function MiniGuide() {
  const isActive = useIsActive();
  return (
    <aside className="guide guide-mini">
      {MINI.map((e) => {
        const active = isActive(e);
        return (
          <Link key={e.to} to={e.to} className={'mini-guide-entry' + (active ? ' active' : '')}>
            <Icon name={active && e.activeIcon ? e.activeIcon : e.icon} />
            <span>{e.label}</span>
          </Link>
        );
      })}
    </aside>
  );
}

export function GuideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const brand = useSettings((s) => s.brand);
  const region = useSettings((s) => s.region);
  return (
    <>
      <div className={'guide-scrim' + (open ? ' open' : '')} onClick={onClose} />
      <aside className={'guide-drawer' + (open ? ' open' : '')} aria-hidden={!open}>
        <div className="guide-drawer-header">
          <button className="icon-btn" onClick={onClose} aria-label="Guide">
            <Icon name="menu" />
          </button>
          <Link to="/" className="masthead-logo" onClick={onClose}>
            <Logo brand={brand} country={region} />
          </Link>
        </div>
        <div className="guide-drawer-body">{open && <GuideContent onNavigate={onClose} />}</div>
      </aside>
    </>
  );
}
