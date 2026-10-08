import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration, pluralize } from '../api/format';
import { videoThumb } from '../api/images';
import { Menu, MenuDivider, MenuItem } from '../components/common/Menu';
import { Icon } from '../icons';
import { partyCan, useParty, type PartyMember } from './store';
import './party.css';

type Tab = 'chat' | 'queue' | 'people';

/** Round letter avatar in the member's party colour (YouTube's default-avatar look). */
export function MemberAvatar({ name, color, size = 24 }: { name: string; color?: string; size?: number }) {
  return (
    <span className="party-avatar" style={{ width: size, height: size, background: color || '#717171', fontSize: size * 0.48 }} aria-hidden="true">
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

export function AvatarStack({ members, max = 4, size = 24 }: { members: PartyMember[]; max?: number; size?: number }) {
  const shown = members.filter((m) => m.connected).slice(0, max);
  return (
    <span className="party-stack">
      {shown.map((m) => (
        <MemberAvatar key={m.id} name={m.name} color={m.color} size={size} />
      ))}
    </span>
  );
}

/** Watch party side panel: header, Chat / Queue / People tabs. `sheet` renders it inside a mobile bottom sheet. */
export function PartyPanel({ sheet }: { sheet?: boolean }) {
  const members = useParty((s) => s.members);
  const queue = useParty((s) => s.queue);
  const status = useParty((s) => s.status);
  const isOwner = useParty((s) => s.ownerId === s.clientId);
  const collapsed = useParty((s) => s.panelCollapsed) && !sheet;
  const [tab, setTab] = useState<Tab>('chat');
  const moreRef = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const watching = members.filter((m) => m.connected).length;
  const { openDialog, leave, setPanelCollapsed } = useParty.getState();

  if (collapsed) {
    return (
      <button className="party-show-btn" onClick={() => setPanelCollapsed(false)}>
        <Icon name="party" />
        Show watch party
        <span className="party-show-count">{watching} watching</span>
      </button>
    );
  }

  return (
    <section className={'party-panel' + (sheet ? ' sheet' : '')} aria-label="Watch party">
      {!sheet && (
        <header className="party-header">
          <div className="party-header-text">
            <div className="party-title">Watch party</div>
            <div className="party-sub">
              {status === 'open' ? `${watching} watching` : status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
            </div>
          </div>
          <AvatarStack members={members} />
          <button className="icon-btn" data-tooltip="Invite" aria-label="Invite" onClick={() => openDialog('invite')}>
            <Icon name="link" />
          </button>
          <button ref={moreRef} className="icon-btn" aria-label="More options" onClick={() => setMoreOpen((o) => !o)}>
            <Icon name="moreVert" />
          </button>
          <Menu anchor={moreRef} open={moreOpen} onClose={() => setMoreOpen(false)} minWidth={220}>
            <MenuItem icon="link" onClick={() => (setMoreOpen(false), openDialog('invite'))}>
              Invite friends
            </MenuItem>
            {isOwner && (
              <MenuItem icon="settings" onClick={() => (setMoreOpen(false), openDialog('settings'))}>
                Party settings
              </MenuItem>
            )}
            <MenuItem icon="chevronUp" onClick={() => (setMoreOpen(false), setPanelCollapsed(true))}>
              Hide watch party
            </MenuItem>
            <MenuDivider />
            <MenuItem icon="signOut" onClick={() => (setMoreOpen(false), leave())}>
              Leave party
            </MenuItem>
          </Menu>
        </header>
      )}
      <div className="party-tabs" role="tablist">
        {(
          [
            ['chat', 'Chat'],
            ['queue', queue.length ? `Queue · ${queue.length}` : 'Queue'],
            ['people', `People · ${watching}`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={'chip' + (tab === id ? ' active' : '')} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="party-body">
        {tab === 'chat' && <ChatTab />}
        {tab === 'queue' && <QueueTab />}
        {tab === 'people' && <PeopleTab />}
      </div>
      {!sheet && (
        <button className="party-hide-btn" onClick={() => setPanelCollapsed(true)}>
          Hide watch party
        </button>
      )}
    </section>
  );
}

/** Invite / settings / leave buttons for the mobile sheet's header (the panel header is hidden there). */
export function PartySheetActions() {
  const isOwner = useParty((s) => s.ownerId === s.clientId);
  const { openDialog, leave } = useParty.getState();
  return (
    <>
      <button className="m-icon-btn" aria-label="Invite" onClick={() => openDialog('invite')}>
        <Icon name="link" />
      </button>
      {isOwner && (
        <button className="m-icon-btn" aria-label="Party settings" onClick={() => openDialog('settings')}>
          <Icon name="settings" />
        </button>
      )}
      <button className="m-icon-btn" aria-label="Leave party" onClick={() => leave()}>
        <Icon name="signOut" />
      </button>
    </>
  );
}

// ------------------------------------------------------------------ chat

function ChatTab() {
  const chat = useParty((s) => s.chat);
  const members = useParty((s) => s.members);
  const chatOn = useParty((s) => s.settings?.chat ?? true);
  const isOwner = useParty((s) => s.ownerId === s.clientId);
  const ownerId = useParty((s) => s.ownerId);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const canChat = chatOn || isOwner;

  // stay pinned to the newest message unless the user scrolled up
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    useParty.getState().send({ t: 'chat', text: t });
    setText('');
  };

  const me = useParty.getState().clientId;
  return (
    <div className="party-chat">
      <div
        className="party-chat-list"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {chat.length === 0 && <div className="party-empty">Say hi! Messages here are only seen by people in this party.</div>}
        {chat.map((m) =>
          m.kind === 'system' ? (
            <div key={m.id} className="party-msg system">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="party-msg">
              <MemberAvatar name={m.name || '?'} color={m.color || members.find((x) => x.id === m.userId)?.color} />
              <div className="party-msg-content">
                <span className={'party-msg-author' + (m.userId === ownerId ? ' owner' : '') + (m.userId === me ? ' me' : '')}>{m.name}</span>
                <span className="party-msg-text">{m.text}</span>
              </div>
            </div>
          ),
        )}
      </div>
      <div className="party-chat-input">
        {canChat ? (
          <>
            <input
              value={text}
              maxLength={300}
              placeholder="Chat…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation(); // keep player keyboard shortcuts out of the chat box
                if (e.key === 'Enter') submit();
              }}
              aria-label="Chat message"
            />
            <span className="party-chat-count">{text.length ? `${text.length}/300` : ''}</span>
            <button className="icon-btn" onClick={submit} disabled={!text.trim()} aria-label="Send">
              <Icon name="send" />
            </button>
          </>
        ) : (
          <div className="party-chat-off">Chat is turned off by the host</div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ queue

function QueueTab() {
  const queue = useParty((s) => s.queue);
  const playback = useParty((s) => s.playback);
  const settings = useParty((s) => s.settings);
  const isOwner = useParty((s) => s.ownerId === s.clientId);
  const me = useParty((s) => s.clientId);
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  const send = useParty.getState().send;
  const canVideo = partyCan('video');
  const canQueue = partyCan('queue');
  void settings; // re-render when permissions change

  return (
    <div className="party-queue">
      {playback?.videoId && (
        <div className="party-now">
          <div className="party-section-label">Now playing</div>
          <Link to={`/watch?v=${playback.videoId}`} className="party-qitem now">
            <span className="party-qthumb">
              <img src={videoThumb(playback.videoId, 'mqdefault')} alt="" loading="lazy" />
              {playback.meta?.lengthSeconds ? <span className="party-qdur">{formatDuration(playback.meta.lengthSeconds)}</span> : null}
            </span>
            <span className="party-qtext">
              <span className="party-qtitle">{playback.meta?.title || 'Loading…'}</span>
              <span className="party-qsub">{playback.meta?.author}</span>
            </span>
          </Link>
          {canVideo && (
            <button className="pill-btn sm icon-leading party-skip" onClick={() => send({ t: 'queue.next' })} disabled={!queue.length}>
              <Icon name="skipNext" />
              Play next in queue
            </button>
          )}
        </div>
      )}
      <div className="party-section-label">
        Up next · {pluralize(queue.length, 'video')}
        {settings && !settings.autoAdvance && <span className="party-hint"> (autoplay off)</span>}
      </div>
      {queue.length === 0 ? (
        <div className="party-empty">
          {canQueue ? 'Open any video’s ⋮ menu and choose “Add to party queue”.' : 'The host hasn’t queued anything yet.'}
        </div>
      ) : (
        <ol className="party-qlist">
          {queue.map((q, i) => {
            const canRemove = isOwner || q.addedById === me;
            return (
              <li
                key={q.id}
                className={'party-qitem' + (drag?.over === i && drag.id !== q.id ? ' drop-target' : '') + (drag?.id === q.id ? ' dragging' : '')}
                draggable={canQueue}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDrag({ id: q.id, over: i });
                }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  if (drag.over !== i) setDrag({ ...drag, over: i });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag && drag.id !== q.id) send({ t: 'queue.move', id: drag.id, to: i });
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
              >
                {canQueue && (
                  <span className="party-qhandle" aria-hidden="true">
                    <Icon name="dragHandle" size={20} />
                  </span>
                )}
                <span className="party-qthumb">
                  <img src={videoThumb(q.videoId, 'mqdefault')} alt="" loading="lazy" />
                  {q.lengthSeconds ? <span className="party-qdur">{formatDuration(q.lengthSeconds)}</span> : null}
                </span>
                <span className="party-qtext">
                  <span className="party-qtitle">{q.title}</span>
                  <span className="party-qsub">
                    {q.author ? `${q.author} · ` : ''}Added by {q.addedById === me ? 'you' : q.addedBy}
                  </span>
                </span>
                <span className="party-qactions">
                  {canVideo && (
                    <button className="icon-btn" data-tooltip="Play now" aria-label="Play now" onClick={() => send({ t: 'queue.playNow', id: q.id })}>
                      <Icon name="play" />
                    </button>
                  )}
                  {canRemove && (
                    <button className="icon-btn" data-tooltip="Remove" aria-label="Remove from queue" onClick={() => send({ t: 'queue.remove', id: q.id })}>
                      <Icon name="trash" />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ people

function PeopleTab() {
  const members = useParty((s) => s.members);
  const me = useParty((s) => s.clientId);
  const isOwner = useParty((s) => s.ownerId === s.clientId);
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="party-people">
      {members.map((m) => (
        <PersonRow key={m.id} m={m} me={m.id === me} canManage={isOwner && m.id !== me} onRename={() => setRenaming(true)} />
      ))}
      {renaming && <RenameRow onDone={() => setRenaming(false)} />}
    </div>
  );
}

function PersonRow({ m, me, canManage, onRename }: { m: PartyMember; me: boolean; canManage: boolean; onRename: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const send = useParty.getState().send;
  return (
    <div className={'party-person' + (m.connected ? '' : ' away')}>
      <MemberAvatar name={m.name} color={m.color} size={32} />
      <div className="party-person-text">
        <span className="party-person-name">
          {m.name}
          {me && <span className="party-you"> (you)</span>}
        </span>
        {m.owner && <span className="party-badge">Host</span>}
        {!m.connected && <span className="party-person-status">Reconnecting…</span>}
      </div>
      {(canManage || me) && (
        <>
          <button ref={ref} className="icon-btn" aria-label={`Options for ${m.name}`} onClick={() => setOpen((o) => !o)}>
            <Icon name="moreVert" />
          </button>
          <Menu anchor={ref} open={open} onClose={() => setOpen(false)} minWidth={200}>
            {me && (
              <MenuItem icon="edit" onClick={() => (setOpen(false), onRename())}>
                Change your name
              </MenuItem>
            )}
            {canManage && m.connected && (
              <MenuItem icon="person" onClick={() => (setOpen(false), send({ t: 'transfer', id: m.id }))}>
                Make host
              </MenuItem>
            )}
            {canManage && (
              <MenuItem icon="notInterested" onClick={() => (setOpen(false), send({ t: 'kick', id: m.id }))}>
                Remove from party
              </MenuItem>
            )}
          </Menu>
        </>
      )}
    </div>
  );
}

function RenameRow({ onDone }: { onDone: () => void }) {
  const myName = useParty((s) => s.members.find((m) => m.id === s.clientId)?.name || '');
  const [name, setName] = useState(myName);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.select(), []);
  const save = () => {
    if (name.trim()) useParty.getState().rename(name);
    onDone();
  };
  return (
    <div className="party-rename">
      <input
        ref={inputRef}
        value={name}
        maxLength={32}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onDone();
        }}
        aria-label="Your name"
      />
      <button className="pill-btn sm text" onClick={onDone}>
        Cancel
      </button>
      <button className="pill-btn sm blue" onClick={save}>
        Save
      </button>
    </div>
  );
}
