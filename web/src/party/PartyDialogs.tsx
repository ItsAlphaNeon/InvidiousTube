import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { videoThumb } from '../api/images';
import { Menu, MenuDivider, MenuItem } from '../components/common/Menu';
import { Modal } from '../components/common/Modal';
import { Spinner } from '../components/common/Spinner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Icon } from '../icons';
import { useAuth } from '../stores/auth';
import { usePlayerSession } from '../stores/player';
import { toast } from '../stores/ui';
import { AvatarStack } from './PartyPanel';
import { fetchPartyInfo, getSavedName, partyLink, useParty, type PartySettings } from './store';
import '../components/common/dialogs.css';
import './party.css';

const defaultName = () => getSavedName() || useAuth.getState().username || '';

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/** Renders whichever party dialog is open. Mounted once inside the router. */
export function PartyDialogs() {
  const dialog = useParty((s) => s.dialog);
  const close = () => useParty.getState().openDialog(null);
  if (dialog === 'start') return <StartDialog onClose={close} />;
  if (dialog === 'invite') return <InviteDialog onClose={close} />;
  if (dialog === 'settings') return <SettingsDialog onClose={close} />;
  return null;
}

/** "Watch together": starts a party, or opens the invite dialog when already in one. */
export function watchTogether(videoId?: string | null) {
  const s = useParty.getState();
  if (s.partyId) s.openDialog('invite');
  else s.openDialog('start', videoId ?? usePlayerSession.getState().videoId);
}

function NameField({ value, onChange, onEnter, autoFocus }: { value: string; onChange: (v: string) => void; onEnter: () => void; autoFocus?: boolean }) {
  return (
    <label className="party-field">
      <span>Your name</span>
      <input
        value={value}
        maxLength={32}
        autoFocus={autoFocus}
        placeholder="How others will see you"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') onEnter();
        }}
      />
    </label>
  );
}

// ------------------------------------------------------------------ start

function StartDialog({ onClose }: { onClose: () => void }) {
  const videoId = useParty((s) => s.startVideoId);
  const sessionVideo = usePlayerSession((s) => (s.video?.videoId === videoId ? s.video : null));
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const start = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await useParty.getState().start(name.trim(), videoId);
      if (videoId && usePlayerSession.getState().videoId !== videoId) navigate(`/watch?v=${videoId}`);
      useParty.getState().openDialog('invite');
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="party-dialog">
      <div className="share-header">
        <span>Watch together</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      {videoId && (
        <div className="party-start-video">
          <img src={videoThumb(videoId, 'mqdefault')} alt="" />
          <div>
            <div className="party-start-title">{sessionVideo?.title || 'Starting with this video'}</div>
            {sessionVideo && <div className="party-start-sub">{sessionVideo.author}</div>}
          </div>
        </div>
      )}
      <p className="party-dialog-text">
        Start a watch party and share the link. Everyone’s video stays in sync — play, pause and skip together, chat, and take turns picking what’s next.
      </p>
      <NameField value={name} onChange={setName} onEnter={start} autoFocus />
      <div className="party-dialog-actions">
        <button className="pill-btn text" onClick={onClose}>
          Cancel
        </button>
        <button className="pill-btn blue" onClick={start} disabled={!name.trim() || busy}>
          {busy ? 'Starting…' : 'Start party'}
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ invite

function InviteDialog({ onClose }: { onClose: () => void }) {
  const partyId = useParty((s) => s.partyId);
  const members = useParty((s) => s.members);
  const locked = useParty((s) => s.settings?.locked);
  const isOwner = useParty((s) => s.ownerId === s.clientId);
  if (!partyId) return null;
  const url = partyLink(partyId);
  const watching = members.filter((m) => m.connected).length;
  const copy = async () => {
    await copyText(url);
    toast('Invite link copied');
  };
  return (
    <Modal onClose={onClose} className="share-dialog party-dialog">
      <div className="share-header">
        <span>Invite to watch party</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="party-invite-people">
        <AvatarStack members={members} max={8} size={32} />
        <span>
          {watching} watching{isOwner ? ' · You’re the host' : ''}
        </span>
      </div>
      <p className="party-dialog-text">
        {locked
          ? 'This party is locked — new people can’t join until the host unlocks it.'
          : 'Anyone with the link can join. Paste it in Discord and it shows what you’re watching.'}
      </p>
      <div className="share-url">
        <input readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="pill-btn blue" onClick={copy}>
          Copy
        </button>
      </div>
      {typeof navigator.share === 'function' && (
        <div className="party-dialog-actions">
          <button className="pill-btn icon-leading" onClick={() => navigator.share({ url, title: 'Join my watch party' }).catch(() => undefined)}>
            <Icon name="share" />
            Share
          </button>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ settings

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useParty((s) => s.settings);
  const isOwner = useParty((s) => s.ownerId === s.clientId);
  useEffect(() => {
    if (!isOwner) onClose();
  }, [isOwner, onClose]);
  if (!settings) return null;
  const patch = (p: Partial<PartySettings>) => useParty.getState().send({ t: 'settings', patch: p });
  const row = (title: string, desc: ReactNode, on: boolean, change: (v: boolean) => void, disabled = false) => (
    <div className={'settings-row party-setting' + (disabled ? ' disabled' : '')}>
      <div className="settings-row-text">
        <div className="settings-row-title">{title}</div>
        <div className="settings-row-desc">{desc}</div>
      </div>
      <div className="settings-row-control">
        <button className={'yt-switch' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={title} disabled={disabled} onClick={() => change(!on)} />
      </div>
    </div>
  );
  const everyone = (v: boolean) => (v ? 'everyone' : 'owner') as 'everyone' | 'owner';
  return (
    <Modal onClose={onClose} className="party-dialog party-settings">
      <div className="share-header">
        <span>Party settings</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="party-settings-group">Videos</div>
      {row('Everyone can pick videos', 'When off, only you can change what’s playing', settings.videoPerm === 'everyone', (v) => patch({ videoPerm: everyone(v) }))}
      {row(
        'Queue picks instead of playing them',
        'Videos others click are added to the queue instead of switching right away',
        settings.pickMode === 'queue',
        (v) => patch({ pickMode: v ? 'queue' : 'play' }),
        settings.videoPerm === 'owner',
      )}
      {row('Everyone can add to the queue', 'When off, only you can queue videos', settings.queuePerm === 'everyone', (v) => patch({ queuePerm: everyone(v) }))}
      {row('Autoplay the queue', 'Play the next queued video when one ends', settings.autoAdvance, (v) => patch({ autoAdvance: v }))}
      {row('Autoplay recommendations', 'When the queue is empty, keep going with a recommended video', settings.autoplayRecs, (v) => patch({ autoplayRecs: v }))}
      <div className="party-settings-group">Playback</div>
      {row('Everyone can play, pause and skip', 'When off, only you control playback', settings.controlPerm === 'everyone', (v) => patch({ controlPerm: everyone(v) }))}
      {row('Sync playback speed', 'Speed changes apply to everyone', settings.syncRate, (v) => patch({ syncRate: v }))}
      <div className="party-settings-group">People</div>
      {row('Live chat', 'Let everyone send chat messages', settings.chat, (v) => patch({ chat: v }))}
      {row('Lock party', 'Nobody new can join with the link', settings.locked, (v) => patch({ locked: v }))}
    </Modal>
  );
}

// ------------------------------------------------------------------ join page (/party/:id)

export function JoinParty() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const partyId = useParty((s) => s.partyId);
  const status = useParty((s) => s.status);
  const playback = useParty((s) => s.playback);
  const [name, setName] = useState(defaultName);
  const [joining, setJoining] = useState(false);
  const info = useQuery({ queryKey: ['party', id], queryFn: () => fetchPartyInfo(id), retry: false, staleTime: 5000 });
  const done = useRef(false);
  useDocumentTitle(info.data ? `${info.data.ownerName}'s watch party` : 'Watch party');

  // once connected, head to whatever the party is watching
  useEffect(() => {
    if (done.current || partyId !== id || status !== 'open') return;
    if (!joining && !info.isFetched) return;
    done.current = true;
    if (playback?.videoId) navigate(`/watch?v=${playback.videoId}`, { replace: true });
    else navigate('/', { replace: true });
  }, [partyId, id, status, playback, joining, info.isFetched, navigate]);

  const join = () => {
    if (!name.trim()) return;
    setJoining(true);
    useParty.getState().join(id, name.trim());
  };

  // left/kicked/failed while joining
  useEffect(() => {
    if (joining && !partyId) setJoining(false);
  }, [joining, partyId]);

  if (info.isLoading) {
    return (
      <div className="party-join">
        <Spinner />
      </div>
    );
  }
  if (info.isError || !info.data) {
    return (
      <div className="party-join">
        <div className="party-join-card">
          <Icon name="party" size={48} />
          <h1>This watch party has ended</h1>
          <p>Ask your friend for a new link, or start your own from any video.</p>
          <button className="pill-btn filled" onClick={() => navigate('/')}>
            Browse videos
          </button>
        </div>
      </div>
    );
  }
  const p = info.data;
  const already = partyId === id;
  return (
    <div className="party-join">
      <div className="party-join-card">
        {p.videoId ? (
          <div className="party-join-thumb">
            <img src={videoThumb(p.videoId, 'hqdefault')} alt="" />
            <span className="party-join-live">
              <Icon name="party" size={16} />
              {p.watching} watching
            </span>
          </div>
        ) : (
          <Icon name="party" size={48} />
        )}
        <h1>{p.ownerName} invited you to watch together</h1>
        {p.meta ? (
          <p>
            Now playing: <b>{p.meta.title}</b>
          </p>
        ) : (
          <p>Join the party and pick something to watch together.</p>
        )}
        {p.locked && !already ? (
          <p className="party-join-locked">
            <Icon name="lock" size={18} /> This party is locked by the host.
          </p>
        ) : (
          <>
            <NameField value={name} onChange={setName} onEnter={join} autoFocus />
            <button className="pill-btn blue party-join-btn" onClick={join} disabled={!name.trim() || joining}>
              {joining ? 'Joining…' : already ? 'Rejoin' : 'Join watch party'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ masthead pill

export function PartyPill({ mobile }: { mobile?: boolean }) {
  const partyId = useParty((s) => s.partyId);
  const members = useParty((s) => s.members);
  const status = useParty((s) => s.status);
  const videoId = useParty((s) => s.playback?.videoId);
  const isOwner = useParty((s) => s.ownerId === s.clientId);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  if (!partyId) return null;
  const watching = members.filter((m) => m.connected).length;
  const { openDialog, leave } = useParty.getState();
  return (
    <>
      <button
        ref={ref}
        className={'party-pill' + (mobile ? ' mobile' : '') + (status !== 'open' ? ' offline' : '')}
        onClick={() => setOpen((o) => !o)}
        aria-label="Watch party"
        data-tooltip={mobile ? undefined : 'Watch party'}
      >
        <Icon name="party" size={20} />
        {!mobile && <span>Party</span>}
        <span className="party-pill-count">{status === 'open' ? watching : '…'}</span>
      </button>
      <Menu anchor={ref} open={open} onClose={() => setOpen(false)} minWidth={240}>
        {videoId && (
          <MenuItem icon="play" onClick={() => (setOpen(false), navigate(`/watch?v=${videoId}`))}>
            Go to party video
          </MenuItem>
        )}
        <MenuItem icon="link" onClick={() => (setOpen(false), openDialog('invite'))}>
          Invite friends
        </MenuItem>
        {isOwner && (
          <MenuItem icon="settings" onClick={() => (setOpen(false), openDialog('settings'))}>
            Party settings
          </MenuItem>
        )}
        <MenuDivider />
        <MenuItem icon="signOut" onClick={() => (setOpen(false), leave())}>
          Leave party
        </MenuItem>
      </Menu>
    </>
  );
}
