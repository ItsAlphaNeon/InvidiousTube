// Watch parties: shared, synced playback over a WebSocket.
//
// The server owns each party's playback clock ({videoId, playing, position, rate, updatedAt});
// clients derive the live position from it and correct their own players. Parties live in memory
// and are dropped a while after the last member leaves.

import express from 'express';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';

const sec = (name, def) => Number(process.env[name] || def) * 1000;
const EMPTY_TTL = sec('PARTY_EMPTY_TTL_SEC', 1800);
const OWNER_GRACE = sec('PARTY_OWNER_GRACE_SEC', 60);
const MEMBER_GRACE = sec('PARTY_MEMBER_GRACE_SEC', 15);
const SWEEP_EVERY = Math.min(5000, MEMBER_GRACE);
const MAX_PARTIES = 200;
const MAX_MEMBERS = 50;
const MAX_QUEUE = 200;
const CHAT_KEEP = 200;

const VIDEO_ID = /^[\w-]{11}$/;
const CLIENT_ID = /^[\w-]{8,64}$/;
const PARTY_ID = /^[A-Za-z0-9]{8}$/;

// YouTube live chat's name colours
const COLORS = ['#ff0000', '#ff7f00', '#e5a400', '#2ba640', '#00b3a4', '#3ea6ff', '#8f68ff', '#ff4fb4', '#c47a3d', '#7cb342'];

export const DEFAULT_SETTINGS = {
  videoPerm: 'everyone', // who can change the video: everyone | owner
  pickMode: 'play', // what a non-owner's pick does: play | queue
  controlPerm: 'everyone', // who can play / pause / seek: everyone | owner
  queuePerm: 'everyone', // who can add to the queue: everyone | owner
  syncRate: true, // share playback speed
  autoAdvance: true, // play the next queued video when one ends
  autoplayRecs: false, // when the queue is empty, autoplay a recommendation
  chat: true,
  locked: false, // no new members
};
const SETTING_VALUES = {
  videoPerm: ['everyone', 'owner'],
  pickMode: ['play', 'queue'],
  controlPerm: ['everyone', 'owner'],
  queuePerm: ['everyone', 'owner'],
};

const token = (bytes = 18) => randomBytes(bytes).toString('base64url');

function partyId() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const b = randomBytes(8);
  return Array.from(b, (x) => abc[x % abc.length]).join('');
}

function cleanName(name) {
  const s = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return s || 'Guest';
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

/**
 * @param {{ lookupVideo: (id: string) => Promise<{title: string, author: string, lengthSeconds: number, thumb: {path: string}}> }} opts
 */
export function createParties({ lookupVideo }) {
  /** @type {Map<string, any>} */
  const parties = new Map();

  async function videoMeta(videoId) {
    try {
      const v = await Promise.race([lookupVideo(videoId), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
      return { title: v.title, author: v.author, lengthSeconds: v.lengthSeconds || 0, thumb: `/vi/${videoId}/mqdefault.jpg` };
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------ party helpers

  function create(name, videoId) {
    if (parties.size >= MAX_PARTIES) {
      // make room by dropping the longest-empty party
      let oldest = null;
      for (const p of parties.values()) if (p.emptySince && (!oldest || p.emptySince < oldest.emptySince)) oldest = p;
      if (!oldest) return null;
      parties.delete(oldest.id);
    }
    let id;
    do id = partyId();
    while (parties.has(id));
    const p = {
      id,
      ownerToken: token(),
      ownerId: null,
      ownerName: cleanName(name),
      ownerAwaySince: null,
      settings: { ...DEFAULT_SETTINGS },
      members: new Map(),
      state: { videoId: null, meta: null, playing: false, position: 0, rate: 1, updatedAt: Date.now() },
      endedFor: null,
      queue: [],
      chat: [],
      banned: new Set(),
      colorIndex: Math.floor(Math.random() * COLORS.length),
      emptySince: Date.now(),
      createdAt: Date.now(),
    };
    parties.set(id, p);
    if (VIDEO_ID.test(videoId || '')) loadVideo(p, videoId, null, 0, false);
    return p;
  }

  const isOwner = (p, m) => p.ownerId === m.id;
  const canVideo = (p, m) => isOwner(p, m) || p.settings.videoPerm === 'everyone';
  const canControl = (p, m) => isOwner(p, m) || p.settings.controlPerm === 'everyone';
  const canQueue = (p, m) => isOwner(p, m) || p.settings.queuePerm === 'everyone';

  function livePosition(p) {
    const s = p.state;
    let pos = s.playing ? s.position + ((Date.now() - s.updatedAt) / 1000) * s.rate : s.position;
    if (s.meta?.lengthSeconds) pos = Math.min(pos, s.meta.lengthSeconds);
    return Math.max(0, pos);
  }

  function membersPublic(p) {
    return [...p.members.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => ({ id: m.id, name: m.name, color: m.color, owner: m.id === p.ownerId, connected: !!m.ws, joinedAt: m.joinedAt }));
  }

  function snapshot(p) {
    return {
      id: p.id,
      ownerId: p.ownerId,
      ownerName: ownerName(p),
      settings: p.settings,
      state: p.state,
      queue: p.queue,
      members: membersPublic(p),
      chat: p.chat.slice(-100),
    };
  }

  function ownerName(p) {
    return p.members.get(p.ownerId)?.name || p.ownerName;
  }

  function broadcast(p, msg) {
    const data = JSON.stringify(msg);
    for (const m of p.members.values()) if (m.ws?.readyState === 1) m.ws.send(data);
  }

  function pushChat(p, msg) {
    p.chat.push(msg);
    if (p.chat.length > CHAT_KEEP) p.chat.splice(0, p.chat.length - CHAT_KEEP);
    broadcast(p, { t: 'chat', msg });
  }

  let chatSeq = 0;
  function system(p, text) {
    pushChat(p, { id: `s${++chatSeq}`, kind: 'system', text, ts: Date.now() });
  }

  function setState(p, patch, event) {
    p.state = { ...p.state, ...patch, updatedAt: Date.now() };
    broadcast(p, { t: 'state', state: p.state, event });
  }

  function loadVideo(p, videoId, by, position = 0, announce = true) {
    p.endedFor = null;
    p.state = { videoId, meta: null, playing: true, position, rate: p.state.rate, updatedAt: Date.now() };
    broadcast(p, { t: 'state', state: p.state, event: by ? { action: 'load', by: by.name, byId: by.id } : undefined });
    videoMeta(videoId).then((meta) => {
      if (p.state.videoId !== videoId) return;
      if (meta) {
        p.state = { ...p.state, meta };
        broadcast(p, { t: 'state', state: p.state });
      }
      if (announce) system(p, `${by ? by.name : 'Queue'} is now playing ${meta ? `“${meta.title}”` : 'a new video'}`);
    });
  }

  async function queueAdd(p, videoId, by) {
    if (p.queue.length >= MAX_QUEUE) return null;
    const meta = await videoMeta(videoId);
    const item = { id: token(6), videoId, title: meta?.title || 'Video', author: meta?.author || '', lengthSeconds: meta?.lengthSeconds || 0, addedBy: by.name, addedById: by.id };
    p.queue.push(item);
    broadcast(p, { t: 'queue', queue: p.queue });
    system(p, `${by.name} added “${item.title}” to the queue`);
    return item;
  }

  /** Moves on after a video: next queued video, a recommendation picked by the owner, or stop. */
  function advance(p, by, manual) {
    if (p.queue.length && (manual || p.settings.autoAdvance)) {
      const item = p.queue.shift();
      broadcast(p, { t: 'queue', queue: p.queue });
      loadVideo(p, item.videoId, by || { id: item.addedById, name: item.addedBy }, 0);
      return true;
    }
    if (!manual && p.settings.autoplayRecs) {
      const owner = p.members.get(p.ownerId);
      if (owner?.ws) {
        send(owner.ws, { t: 'pickNext', after: p.state.videoId });
        return true;
      }
    }
    if (!manual) setState(p, { playing: false, position: livePosition(p) });
    return false;
  }

  function setOwner(p, m) {
    p.ownerId = m.id;
    p.ownerName = m.name;
    p.ownerToken = token();
    p.ownerAwaySince = null;
    send(m.ws, { t: 'owner', token: p.ownerToken, partyId: p.id });
    broadcast(p, { t: 'members', members: membersPublic(p), ownerId: p.ownerId });
    system(p, `${m.name} is now the host`);
  }

  function removeMember(p, m, reason) {
    p.members.delete(m.id);
    broadcast(p, { t: 'members', members: membersPublic(p), ownerId: p.ownerId });
    if (reason === 'left') system(p, `${m.name} left`);
  }

  // ------------------------------------------------------------------ message handling

  function allow(m) {
    const now = Date.now();
    m.tokens = Math.min(20, m.tokens + ((now - m.refill) / 1000) * 20);
    m.refill = now;
    if (m.tokens < 1) return false;
    m.tokens -= 1;
    return true;
  }

  async function onMessage(p, m, msg) {
    const deny = (reason) => send(m.ws, { t: 'denied', reason, state: p.state });
    const num = (x) => (typeof x === 'number' && isFinite(x) && x >= 0 && x < 1e7 ? x : null);
    switch (msg.t) {
      case 'ping':
        return send(m.ws, { t: 'pong', c: msg.c, s: Date.now() });

      case 'play':
      case 'pause':
      case 'seek': {
        if (!p.state.videoId) return;
        if (!canControl(p, m)) return deny('control');
        const position = num(msg.position) ?? livePosition(p);
        const playing = msg.t === 'play' ? true : msg.t === 'pause' ? false : p.state.playing;
        // ignore no-op echoes (e.g. two members pressing play at the same moment)
        if (msg.t !== 'seek' && playing === p.state.playing && Math.abs(position - livePosition(p)) < 1) return;
        if (msg.t === 'play') p.endedFor = null;
        return setState(p, { playing, position }, { action: msg.t, by: m.name, byId: m.id, position });
      }

      case 'rate': {
        if (!p.settings.syncRate || !p.state.videoId) return;
        if (!canControl(p, m)) return deny('control');
        const rate = Number(msg.rate);
        if (!(rate >= 0.25 && rate <= 4) || rate === p.state.rate) return;
        return setState(p, { rate, position: livePosition(p) }, { action: 'rate', by: m.name, byId: m.id, rate });
      }

      case 'load': {
        const videoId = String(msg.videoId || '');
        if (!VIDEO_ID.test(videoId) || videoId === p.state.videoId) return;
        const position = num(msg.position) ?? 0;
        if (isOwner(p, m) || (canVideo(p, m) && p.settings.pickMode === 'play')) return loadVideo(p, videoId, m, position);
        if (canQueue(p, m)) {
          const item = await queueAdd(p, videoId, m);
          return send(m.ws, { t: 'queued', videoId, ok: !!item, state: p.state });
        }
        return deny('video');
      }

      case 'ended': {
        if (msg.videoId !== p.state.videoId || p.endedFor === msg.videoId) return;
        p.endedFor = msg.videoId;
        return advance(p, null, false);
      }

      case 'queue.add': {
        const videoId = String(msg.videoId || '');
        if (!VIDEO_ID.test(videoId)) return;
        if (!canQueue(p, m)) return deny('queue');
        return queueAdd(p, videoId, m);
      }
      case 'queue.remove': {
        const i = p.queue.findIndex((q) => q.id === msg.id);
        if (i < 0) return;
        if (!isOwner(p, m) && p.queue[i].addedById !== m.id) return deny('queue');
        p.queue.splice(i, 1);
        return broadcast(p, { t: 'queue', queue: p.queue });
      }
      case 'queue.move': {
        const i = p.queue.findIndex((q) => q.id === msg.id);
        const to = Math.max(0, Math.min(p.queue.length - 1, Number(msg.to) | 0));
        if (i < 0 || i === to) return;
        if (!canQueue(p, m)) return deny('queue');
        const [item] = p.queue.splice(i, 1);
        p.queue.splice(to, 0, item);
        return broadcast(p, { t: 'queue', queue: p.queue });
      }
      case 'queue.playNow': {
        const i = p.queue.findIndex((q) => q.id === msg.id);
        if (i < 0) return;
        if (!canVideo(p, m)) return deny('video');
        const [item] = p.queue.splice(i, 1);
        broadcast(p, { t: 'queue', queue: p.queue });
        return loadVideo(p, item.videoId, m, 0);
      }
      case 'queue.next': {
        if (!canVideo(p, m)) return deny('video');
        if (!advance(p, m, true)) send(m.ws, { t: 'notice', text: 'The party queue is empty' });
        return;
      }

      case 'chat': {
        const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (!text) return;
        if (!p.settings.chat && !isOwner(p, m)) return deny('chat');
        const now = Date.now();
        m.chatTimes = m.chatTimes.filter((t) => now - t < 5000);
        if (m.chatTimes.length >= 5) return send(m.ws, { t: 'notice', text: 'Slow down! You are sending messages too fast' });
        m.chatTimes.push(now);
        return pushChat(p, { id: token(6), kind: 'user', userId: m.id, name: m.name, color: m.color, text, ts: now });
      }

      case 'settings': {
        if (!isOwner(p, m)) return deny('owner');
        const next = { ...p.settings };
        for (const [k, v] of Object.entries(msg.patch || {})) {
          if (!(k in DEFAULT_SETTINGS)) continue;
          if (SETTING_VALUES[k]) {
            if (SETTING_VALUES[k].includes(v)) next[k] = v;
          } else if (typeof v === 'boolean') next[k] = v;
        }
        if (msg.patch?.chat !== undefined && next.chat !== p.settings.chat) system(p, `${m.name} turned chat ${next.chat ? 'on' : 'off'}`);
        if (msg.patch?.locked !== undefined && next.locked !== p.settings.locked) system(p, next.locked ? `${m.name} locked the party` : `${m.name} unlocked the party`);
        p.settings = next;
        return broadcast(p, { t: 'settings', settings: p.settings });
      }

      case 'kick': {
        if (!isOwner(p, m)) return deny('owner');
        const target = p.members.get(msg.id);
        if (!target || target.id === m.id) return;
        p.banned.add(target.id);
        send(target.ws, { t: 'kicked' });
        target.ws?.close(4003, 'kicked');
        target.ws = null;
        removeMember(p, target, 'kicked');
        return system(p, `${target.name} was removed by the host`);
      }

      case 'transfer': {
        if (!isOwner(p, m)) return deny('owner');
        const target = p.members.get(msg.id);
        if (!target || target.id === m.id || !target.ws) return;
        return setOwner(p, target);
      }

      case 'rename': {
        const name = cleanName(msg.name);
        if (name === m.name) return;
        const old = m.name;
        m.name = name;
        if (isOwner(p, m)) p.ownerName = name;
        broadcast(p, { t: 'members', members: membersPublic(p), ownerId: p.ownerId });
        return system(p, `${old} is now ${name}`);
      }

      case 'leave': {
        const ws = m.ws;
        m.ws = null;
        removeMember(p, m, 'left');
        ws?.close(1000, 'left');
        // a host who leaves hands the party to whoever has been here longest
        if (isOwner(p, m)) {
          const next = [...p.members.values()].filter((x) => x.ws).sort((a, b) => a.joinedAt - b.joinedAt)[0];
          if (next) setOwner(p, next);
        }
        return;
      }
    }
  }

  function onHello(ws, msg) {
    const p = parties.get(String(msg.party || ''));
    if (!p) return send(ws, { t: 'error', code: 'not_found' }), ws.close(4004, 'not found');
    const clientId = String(msg.clientId || '');
    if (!CLIENT_ID.test(clientId)) return send(ws, { t: 'error', code: 'bad_request' }), ws.close(4000);
    const ownerOk = !!msg.ownerToken && msg.ownerToken === p.ownerToken;
    if (!ownerOk && p.banned.has(clientId)) return send(ws, { t: 'error', code: 'kicked' }), ws.close(4003);

    let m = p.members.get(clientId);
    const isNew = !m;
    if (isNew) {
      if (p.settings.locked && !ownerOk) return send(ws, { t: 'error', code: 'locked' }), ws.close(4005);
      if (p.members.size >= MAX_MEMBERS) return send(ws, { t: 'error', code: 'full' }), ws.close(4006);
      m = { id: clientId, name: cleanName(msg.name), color: COLORS[p.colorIndex++ % COLORS.length], ws: null, joinedAt: Date.now(), leftAt: 0, tokens: 20, refill: Date.now(), chatTimes: [] };
      p.members.set(clientId, m);
    } else if (m.ws && m.ws !== ws) {
      // same client reconnecting (new tab load, network blip): drop the stale socket quietly
      const old = m.ws;
      m.ws = null;
      old.close(4001, 'replaced');
    }
    m.ws = ws;
    m.leftAt = 0;
    if (msg.name) m.name = cleanName(msg.name);
    p.emptySince = null;
    if (ownerOk) {
      p.ownerId = clientId;
      p.ownerName = m.name;
      p.ownerAwaySince = null;
    }
    ws.party = p;
    ws.member = m;
    send(ws, { t: 'welcome', you: clientId, owner: p.ownerId === clientId, party: snapshot(p), s: Date.now() });
    broadcast(p, { t: 'members', members: membersPublic(p), ownerId: p.ownerId });
    if (isNew) system(p, `${m.name} joined the party`);
  }

  // ------------------------------------------------------------------ lifecycle

  function sweep() {
    const now = Date.now();
    for (const p of parties.values()) {
      for (const m of p.members.values()) if (!m.ws && m.leftAt && now - m.leftAt > MEMBER_GRACE) removeMember(p, m, 'left');
      const connected = [...p.members.values()].filter((m) => m.ws).sort((a, b) => a.joinedAt - b.joinedAt);
      if (!connected.length) {
        p.emptySince ||= now;
        if (now - p.emptySince > EMPTY_TTL) parties.delete(p.id);
        continue;
      }
      p.emptySince = null;
      if (p.members.get(p.ownerId)?.ws) p.ownerAwaySince = null;
      else {
        p.ownerAwaySince ||= now;
        if (now - p.ownerAwaySince > OWNER_GRACE) setOwner(p, connected[0]);
      }
    }
  }
  setInterval(sweep, SWEEP_EVERY).unref();

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (!ws.party) {
        if (msg.t === 'hello') onHello(ws, msg);
        return;
      }
      const m = ws.member;
      if (m.ws !== ws) return;
      if (msg.t !== 'ping' && !allow(m)) return;
      Promise.resolve(onMessage(ws.party, m, msg)).catch((e) => console.error('[party]', e));
    });
    ws.on('close', () => {
      const m = ws.member;
      const p = ws.party;
      if (!m || m.ws !== ws) return;
      m.ws = null;
      m.leftAt = Date.now();
      broadcast(p, { t: 'members', members: membersPublic(p), ownerId: p.ownerId });
    });
  });
  // drop dead connections (sleeping phones, vanished networks)
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000).unref();

  // ------------------------------------------------------------------ HTTP

  const router = express.Router();
  router.post('/x/party', express.json(), (req, res) => {
    const p = create(req.body?.name, req.body?.videoId);
    if (!p) return res.status(503).json({ error: 'Too many watch parties right now. Try again later.' });
    res.json({ id: p.id, ownerToken: p.ownerToken });
  });
  router.get('/x/party/:id', (req, res) => {
    const p = info(req.params.id);
    if (!p) return res.status(404).json({ error: 'This watch party has ended' });
    res.json(p);
  });

  function info(id) {
    if (!PARTY_ID.test(id)) return null;
    const p = parties.get(id);
    if (!p) return null;
    return {
      id: p.id,
      ownerName: ownerName(p),
      watching: [...p.members.values()].filter((m) => m.ws).length,
      locked: p.settings.locked,
      videoId: p.state.videoId,
      meta: p.state.meta,
    };
  }

  return {
    router,
    info,
    attach(server) {
      server.on('upgrade', (req, socket, head) => {
        if (new URL(req.url, 'http://x').pathname !== '/x/party/ws') return socket.destroy();
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      });
    },
  };
}
