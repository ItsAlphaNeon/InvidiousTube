import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { timeAgo } from '../../api/format';
import { videoThumb } from '../../api/images';
import { flattenFeed, useChannelAvatar, useSubscriptionFeed, useSubscriptions } from '../../hooks/useAccount';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { Icon, Logo } from '../../icons';
import { useAuth } from '../../stores/auth';
import { useSettings, type ThemeSetting } from '../../stores/settings';
import { toast } from '../../stores/ui';
import { Avatar } from '../common/Avatar';
import { Menu, MenuDivider, MenuItem } from '../common/Menu';
import { SearchBox } from './SearchBox';
import { useShortsFilter } from '../../hooks/useShortsFilter';

export function Masthead({ onMenu }: { onMenu: () => void }) {
  const narrow = useMediaQuery('(max-width: 656px)');
  const [searchMode, setSearchMode] = useState(false);
  const brand = useSettings((s) => s.brand);
  const region = useSettings((s) => s.region);
  const loggedIn = useAuth((s) => s.loggedIn);
  const { subs } = useSubscriptions();

  if (narrow && searchMode) {
    return (
      <header className="masthead search-mode">
        <button className="icon-btn" onClick={() => setSearchMode(false)} aria-label="Back">
          <Icon name="back" />
        </button>
        <SearchBox autoFocus onDone={() => setSearchMode(false)} />
      </header>
    );
  }

  return (
    <header className="masthead">
      <div className="masthead-start">
        <button className="icon-btn" onClick={onMenu} aria-label="Guide">
          <Icon name="menu" />
        </button>
        <Link to="/" className="masthead-logo" data-tooltip={`${brand} Home`} aria-label={`${brand} Home`}>
          <Logo brand={brand} country={region} />
        </Link>
      </div>
      <div className="masthead-center">{!narrow && <SearchBox />}</div>
      <div className="masthead-end">
        {narrow && (
          <button className="icon-btn" onClick={() => setSearchMode(true)} aria-label="Search">
            <Icon name="search" />
          </button>
        )}
        {(loggedIn || subs.length > 0) && <CreateButton />}
        {(loggedIn || subs.length > 0) && <NotificationsButton />}
        {!loggedIn && <SettingsMenuButton />}
        {loggedIn ? <AccountButton /> : <SignInButton />}
      </div>
    </header>
  );
}

function CreateButton() {
  return (
    <button
      className="icon-btn masthead-create"
      data-tooltip="Create"
      aria-label="Create"
      onClick={() => toast('Uploading is not available on Invidious')}
    >
      <Icon name="create" />
    </button>
  );
}

function SignInButton() {
  return (
    <Link to="/login" className="pill-btn outline sm icon-leading signin-btn">
      <Icon name="account" />
      Sign in
    </Link>
  );
}

function NotificationsButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const feed = useSubscriptionFeed(true);
  const all = useMemo(() => flattenFeed(feed.data?.pages).slice(0, 40), [feed.data]);
  const videos = useShortsFilter(all).items.slice(0, 20);
  const fresh = videos.filter((v) => v.published && Date.now() / 1000 - v.published < 60 * 60 * 24 * 2).length;
  const navigate = useNavigate();
  return (
    <>
      <button ref={ref} className="icon-btn" data-tooltip="Notifications" aria-label="Notifications" onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" />
        {fresh > 0 && <span className="notif-badge">{fresh > 9 ? '9+' : fresh}</span>}
      </button>
      <Menu anchor={ref} open={open} onClose={() => setOpen(false)} className="notif-menu">
        <div className="notif-header">
          <span>Notifications</span>
          <button className="icon-btn" aria-label="Settings" onClick={() => (setOpen(false), navigate('/settings'))}>
            <Icon name="settings" />
          </button>
        </div>
        <div className="menu-divider" style={{ margin: 0 }} />
        <div className="notif-list">
          {videos.length === 0 && <div className="notif-empty">Your notifications live here</div>}
          {videos.map((v) => (
            <NotifItem key={v.videoId} v={v} onClick={() => (setOpen(false), navigate(`/watch?v=${v.videoId}`))} />
          ))}
        </div>
      </Menu>
    </>
  );
}

function NotifItem({
  v,
  onClick,
}: {
  v: { videoId: string; title: string; author: string; authorId: string; published?: number; publishedText?: string };
  onClick: () => void;
}) {
  const avatar = useChannelAvatar(v.authorId);
  const isNew = v.published && Date.now() / 1000 - v.published < 60 * 60 * 24 * 2;
  return (
    <button className="notif-item" onClick={onClick}>
      <span className={'notif-dot' + (isNew ? ' on' : '')} />
      <Avatar src={avatar} name={v.author} size={48} />
      <span className="notif-body">
        <span className="notif-title clamp-3">
          {v.author} uploaded: {v.title}
        </span>
        <span className="notif-time">{timeAgo(v.published, v.publishedText)}</span>
      </span>
      <img className="notif-thumb" src={videoThumb(v.videoId, 'mqdefault')} alt="" loading="lazy" />
    </button>
  );
}

const THEMES: { id: ThemeSetting; label: string }[] = [
  { id: 'system', label: 'Use device theme' },
  { id: 'dark', label: 'Dark theme' },
  { id: 'light', label: 'Light theme' },
];

function AppearanceItems({ onBack }: { onBack: () => void }) {
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  return (
    <>
      <div className="menu-header" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        Appearance
      </div>
      <div className="menu-divider" />
      <div style={{ padding: '4px 16px 12px', fontSize: 12, color: 'var(--text-2)' }}>Setting applies to this browser only</div>
      {THEMES.map((t) => (
        <MenuItem key={t.id} checked={theme === t.id} onClick={() => set({ theme: t.id })}>
          {t.label}
        </MenuItem>
      ))}
    </>
  );
}

function themeLabel(t: ThemeSetting) {
  return t === 'system' ? 'Device theme' : t === 'dark' ? 'Dark' : 'Light';
}

function SettingsMenuButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<'main' | 'appearance'>('main');
  const theme = useSettings((s) => s.theme);
  const navigate = useNavigate();
  const close = () => {
    setOpen(false);
    setPage('main');
  };
  return (
    <>
      <button ref={ref} className="icon-btn" data-tooltip="Settings" aria-label="Settings" onClick={() => setOpen((o) => !o)}>
        <Icon name="moreVert" />
      </button>
      <Menu anchor={ref} open={open} onClose={close} minWidth={300}>
        {page === 'main' ? (
          <>
            <MenuItem icon="history" onClick={() => (close(), navigate('/feed/history'))}>
              Your data in {useSettings.getState().brand}
            </MenuItem>
            <MenuItem icon="appearance" trailing={<Icon name="chevronRight" />} onClick={() => setPage('appearance')}>
              Appearance: {themeLabel(theme)}
            </MenuItem>
            <MenuDivider />
            <MenuItem icon="settings" onClick={() => (close(), navigate('/settings'))}>
              Settings
            </MenuItem>
            <MenuItem icon="keyboard" onClick={() => (close(), navigate('/settings#shortcuts'))}>
              Keyboard shortcuts
            </MenuItem>
          </>
        ) : (
          <AppearanceItems onBack={() => setPage('main')} />
        )}
      </Menu>
    </>
  );
}

function AccountButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<'main' | 'appearance'>('main');
  const username = useAuth((s) => s.username) || 'You';
  const logout = useAuth((s) => s.logout);
  const theme = useSettings((s) => s.theme);
  const navigate = useNavigate();
  const { data: cfg } = useQuery({ queryKey: ['x-config'], queryFn: () => fetch('/api/v1/stats').then((r) => r.json()), staleTime: Infinity });
  const close = () => {
    setOpen(false);
    setPage('main');
  };
  return (
    <>
      <button ref={ref} className="masthead-avatar" aria-label="Account" onClick={() => setOpen((o) => !o)}>
        <Avatar name={username} size={32} />
      </button>
      <Menu anchor={ref} open={open} onClose={close} minWidth={300}>
        {page === 'main' ? (
          <>
            <div className="account-header">
              <Avatar name={username} size={40} />
              <div>
                <div className="account-name">{username}</div>
                <div className="account-handle">Invidious account{cfg?.software?.version ? ` · v${String(cfg.software.version).split('-')[0]}` : ''}</div>
                <Link to="/feed/you" className="account-link" onClick={close}>
                  View your library
                </Link>
              </div>
            </div>
            <MenuDivider />
            <MenuItem
              icon="signOut"
              onClick={async () => {
                close();
                await logout();
                toast('Signed out');
                navigate('/');
              }}
            >
              Sign out
            </MenuItem>
            <MenuDivider />
            <MenuItem icon="history" onClick={() => (close(), navigate('/feed/history'))}>
              Your data in {useSettings.getState().brand}
            </MenuItem>
            <MenuItem icon="appearance" trailing={<Icon name="chevronRight" />} onClick={() => setPage('appearance')}>
              Appearance: {themeLabel(theme)}
            </MenuItem>
            <MenuDivider />
            <MenuItem icon="settings" onClick={() => (close(), navigate('/settings'))}>
              Settings
            </MenuItem>
            <MenuItem icon="keyboard" onClick={() => (close(), navigate('/settings#shortcuts'))}>
              Keyboard shortcuts
            </MenuItem>
          </>
        ) : (
          <AppearanceItems onBack={() => setPage('main')} />
        )}
      </Menu>
    </>
  );
}
