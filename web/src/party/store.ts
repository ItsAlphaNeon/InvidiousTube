import { create } from 'zustand';
import { formatDuration } from '../api/format';
import { usePlayerSession } from '../stores/player';
import { toast } from '../stores/ui';

// ------------------------------------------------------------------ protocol types (see server/src/party.js)

export interface PartyVideoMeta {
  title: string;
  author: string;
  lengthSeconds: number;
  thumb: string;
}

export interface PartyPlayback {
  videoId: string | null;
  meta: PartyVideoMeta | null;
  playing: boolean;
  position: number;
  rate: number;
  /** server clock (ms) when position was taken */
  updatedAt: number;
}

export interface PartySettings {
  videoPerm: 'everyone' | 'owner';
  pickMode: 'play' | 'queue';
  controlPerm: 'everyone' | 'owner';
  queuePerm: 'everyone' | 'owner';
  syncRate: boolean;
  autoAdvance: boolean;
  autoplayRecs: boolean;
  chat: boolean;
  locked: boolean;
}

export interface PartyMember {
  id: string;
  name: string;
  color: string;
  owner: boolean;
  connected: boolean;
  joinedAt: number;
}

export interface PartyQueueItem {
  id: string;
  videoId: string;
  title: string;
  author: string;
  lengthSeconds: number;
  addedBy: string;
  addedById: string;
}

export interface PartyChatMessage {
  id: string;
  kind: 'user' | 'system';
  userId?: string;
  name?: string;
  color?: string;
  text: string;
  ts: number;
}

export interface PartyInfo {
  id: string;
  ownerName: string;
  watching: number;
  locked: boolean;
  videoId: string | null;
  meta: PartyVideoMeta | null;
}

type Status = 'idle' | 'connecting' | 'open' | 'reconnecting';

interface PartyState {
  partyId: string | null;
  clientId: string;
  status: Status;
  ownerId: string | null;
  settings: PartySettings | null;
  playback: PartyPlayback | null;
  members: PartyMember[];
  queue: PartyQueueItem[];
  chat: PartyChatMessage[];
  /** server clock minus local clock, in ms */
  offset: number;
  /** UI: dialogs shared by the watch page, masthead and menus */
  dialog: null | 'invite' | 'settings' | 'start';
  /** video to start the party with when the start dialog was opened from a video menu */
  startVideoId: string | null;
  panelCollapsed: boolean;

  join: (partyId: string, name: string) => void;
  leave: (opts?: { silent?: boolean }) => void;
  rename: (name: string) => void;
  send: (msg: Record<string, unknown>) => void;
  start: (name: string, videoId?: string | null) => Promise<string>;
  openDialog: (dialog: PartyState['dialog'], startVideoId?: string | null) => void;
  setPanelCollapsed: (v: boolean) => void;
}

// ------------------------------------------------------------------ persistence

const SESSION_KEY = 'itube-party';
const NAME_KEY = 'itube-party-name';
const OWNER_KEY = 'itube-party-owner';

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    return JSON.parse(storage.getItem(key) || '') ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(storage: Storage, key: string, value: unknown) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export const getSavedName = (): string => readJson(localStorage, NAME_KEY, '');
const saveName = (name: string) => writeJson(localStorage, NAME_KEY, name);
const ownerTokens = (): Record<string, string> => readJson(localStorage, OWNER_KEY, {});
function saveOwnerToken(partyId: string, token: string | null) {
  const all = ownerTokens();
  if (token) all[partyId] = token;
  else delete all[partyId];
  // keep the list short
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 20))) delete all[k];
  writeJson(localStorage, OWNER_KEY, all);
}

function newClientId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
}

const saved = readJson<{ partyId?: string; clientId?: string; name?: string } | null>(sessionStorage, SESSION_KEY, null);

// ------------------------------------------------------------------ socket

let ws: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let bestRtt = Infinity;
let joinName = saved?.name || '';

const DENIED: Record<string, string> = {
  control: 'Only the host can control playback',
  video: 'Only the host can change the video',
  queue: 'Only the host can manage the queue',
  chat: 'Chat is turned off',
  owner: 'Only the host can do that',
};
const ERRORS: Record<string, string> = {
  not_found: 'This watch party has ended',
  kicked: 'You were removed from this watch party',
  locked: 'This watch party is locked',
  full: 'This watch party is full',
  bad_request: 'Could not join the watch party',
};

/** Live position of the party's video, in seconds. */
export function partyPosition(p: PartyPlayback, offset: number): number {
  let pos = p.playing ? p.position + ((Date.now() + offset - p.updatedAt) / 1000) * p.rate : p.position;
  if (p.meta?.lengthSeconds) pos = Math.min(pos, p.meta.lengthSeconds);
  return Math.max(0, pos);
}

function eventToast(e: { action: string; by: string; byId: string; position?: number; rate?: number }) {
  if (e.byId === useParty.getState().clientId) return;
  const text =
    e.action === 'play'
      ? `${e.by} played the video`
      : e.action === 'pause'
        ? `${e.by} paused the video`
        : e.action === 'seek'
          ? `${e.by} skipped to ${formatDuration(e.position ?? 0)}`
          : e.action === 'rate'
            ? `${e.by} changed the speed to ${e.rate}x`
            : e.action === 'load'
              ? `${e.by} picked a new video`
              : '';
  if (text) toast(text, { duration: 2500 });
}

function onMessage(msg: any) {
  const set = useParty.setState;
  const st = useParty.getState();
  switch (msg.t) {
    case 'welcome': {
      retry = 0;
      const p = msg.party;
      set({ status: 'open', ownerId: p.ownerId, settings: p.settings, playback: p.state, members: p.members, queue: p.queue, chat: p.chat });
      sampleClock(msg.s, Date.now(), 0);
      break;
    }
    case 'pong':
      sampleClock(msg.s, msg.c, Date.now() - msg.c);
      break;
    case 'state':
      set({ playback: msg.state });
      if (msg.event) eventToast(msg.event);
      break;
    case 'members':
      // (a saved owner token is never cleared here: another tab of this browser may hold host with it,
      // and the server rotates the token whenever host really passes to someone else)
      set({ members: msg.members, ownerId: msg.ownerId });
      break;
    case 'queue':
      set({ queue: msg.queue });
      break;
    case 'settings':
      set({ settings: msg.settings });
      break;
    case 'chat':
      set({ chat: [...st.chat.slice(-199), msg.msg] });
      break;
    case 'owner':
      saveOwnerToken(msg.partyId, msg.token);
      toast('You are now the host of this watch party');
      break;
    case 'denied':
      if (msg.state) set({ playback: msg.state });
      toast(DENIED[msg.reason] || 'Not allowed');
      break;
    case 'queued':
      if (msg.state) set({ playback: msg.state });
      toast(msg.ok ? 'Added to the party queue' : 'The party queue is full');
      break;
    case 'notice':
      toast(msg.text);
      break;
    case 'pickNext': {
      // the host's client picks the next recommendation when autoplay is on and the queue is empty
      const v = usePlayerSession.getState().video;
      const next = v && v.videoId === msg.after ? v.recommendedVideos?.find((r) => r.lengthSeconds > 90) : undefined;
      if (next) st.send({ t: 'load', videoId: next.videoId });
      break;
    }
    case 'kicked':
      toast(ERRORS.kicked);
      st.leave({ silent: true });
      break;
    case 'error':
      toast(ERRORS[msg.code] || 'Could not join the watch party');
      st.leave({ silent: true });
      break;
  }
}

function sampleClock(server: number, sentAt: number, rtt: number) {
  // keep the estimate from the fastest round trip (least network jitter)
  if (rtt > bestRtt * 1.5 + 20) return;
  bestRtt = Math.min(bestRtt, rtt || Infinity);
  useParty.setState({ offset: server - (sentAt + rtt / 2) });
}

function connect() {
  const { partyId, clientId } = useParty.getState();
  if (!partyId) return;
  clearTimeout(retryTimer);
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const sock = new WebSocket(`${proto}//${location.host}/x/party/ws`);
  ws = sock;
  sock.onopen = () => {
    sock.send(JSON.stringify({ t: 'hello', party: partyId, clientId, name: joinName, ownerToken: ownerTokens()[partyId] }));
    bestRtt = Infinity;
    let n = 0;
    const ping = () => sock.readyState === 1 && sock.send(JSON.stringify({ t: 'ping', c: Date.now() }));
    clearInterval(pingTimer);
    // a quick burst for a good first estimate, then keep it fresh
    pingTimer = setInterval(() => (n++ < 5 || n % 20 === 0) && ping(), 500);
  };
  sock.onmessage = (e) => {
    if (ws !== sock) return;
    try {
      onMessage(JSON.parse(e.data));
    } catch (err) {
      console.error('[party]', err);
    }
  };
  sock.onclose = (e) => {
    if (ws !== sock) return;
    ws = null;
    clearInterval(pingTimer);
    if (!useParty.getState().partyId || e.code === 4001) return;
    useParty.setState({ status: 'reconnecting' });
    retryTimer = setTimeout(connect, Math.min(15000, 500 * 2 ** retry++));
  };
}

function persist() {
  const { partyId, clientId } = useParty.getState();
  writeJson(sessionStorage, SESSION_KEY, partyId ? { partyId, clientId, name: joinName } : null);
}

// ------------------------------------------------------------------ store

export const useParty = create<PartyState>()((set, get) => ({
  partyId: null,
  clientId: saved?.clientId || newClientId(),
  status: 'idle',
  ownerId: null,
  settings: null,
  playback: null,
  members: [],
  queue: [],
  chat: [],
  offset: 0,
  dialog: null,
  startVideoId: null,
  panelCollapsed: false,

  join: (partyId, name) => {
    if (get().partyId === partyId && ws) return get().rename(name);
    joinName = name.trim().slice(0, 32) || 'Guest';
    saveName(joinName);
    if (get().partyId) get().leave({ silent: true });
    set({ partyId, status: 'connecting', chat: [], queue: [], members: [], playback: null, settings: null, ownerId: null, panelCollapsed: false });
    persist();
    connect();
  },

  leave: (opts) => {
    const { partyId } = get();
    if (!partyId) return;
    const sock = ws;
    ws = null;
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    if (sock?.readyState === 1) sock.send(JSON.stringify({ t: 'leave' }));
    sock?.close();
    set({ partyId: null, status: 'idle', ownerId: null, settings: null, playback: null, members: [], queue: [], chat: [], dialog: null });
    persist();
    if (!opts?.silent) toast('You left the watch party');
  },

  rename: (name) => {
    joinName = name.trim().slice(0, 32) || joinName;
    saveName(joinName);
    persist();
    get().send({ t: 'rename', name: joinName });
  },

  send: (msg) => {
    if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
  },

  start: async (name, videoId) => {
    const r = await fetch('/x/party', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, videoId: videoId || undefined }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Could not start a watch party');
    saveOwnerToken(data.id, data.ownerToken);
    get().join(data.id, name);
    return data.id as string;
  },

  openDialog: (dialog, startVideoId = null) => set({ dialog, startVideoId }),
  setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
}));

// Rejoin after a page refresh
if (saved?.partyId) {
  useParty.setState({ partyId: saved.partyId, status: 'connecting' });
  connect();
}

export async function fetchPartyInfo(id: string): Promise<PartyInfo> {
  const r = await fetch(`/x/party/${encodeURIComponent(id)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'This watch party has ended');
  return data;
}

// ------------------------------------------------------------------ selectors

export const useInParty = () => useParty((s) => !!s.partyId);
export const useIsPartyOwner = () => useParty((s) => !!s.partyId && s.ownerId === s.clientId);
export const partyLink = (id: string) => `${location.origin}/party/${id}`;

/** Whether this member may do something, per the host's settings. */
export function partyCan(what: 'video' | 'control' | 'queue'): boolean {
  const s = useParty.getState();
  if (!s.settings) return false;
  if (s.ownerId === s.clientId) return true;
  if (what === 'video') return s.settings.videoPerm === 'everyone';
  if (what === 'control') return s.settings.controlPerm === 'everyone';
  return s.settings.queuePerm === 'everyone';
}
