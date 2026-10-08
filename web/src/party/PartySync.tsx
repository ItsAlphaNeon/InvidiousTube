import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerSession } from '../stores/player';
import { partyCan, partyPosition, useParty } from './store';

/** Seconds of drift tolerated before a hard seek (while playing / while paused). */
const DRIFT_PLAYING = 1;
const DRIFT_PAUSED = 0.3;
/** A newly loaded video only reports local actions once it has been in sync this long. */
const SETTLE_MS = 1500;

/**
 * Bridges the party's shared playback clock and the persistent player:
 * remote state is applied to the local <video>, and local play / pause / seek / speed changes and
 * video picks are sent to the party. Mounted once inside the router.
 */
export function PartySync() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const partyId = useParty((s) => s.partyId);

  useEffect(() => {
    if (!partyId) return;
    const sync = {
      /** timestamps of play()/pause() calls we made, so their events aren't echoed back */
      expectPlay: 0,
      expectPause: 0,
      expectSeek: null as null | { t: number; at: number },
      expectRate: null as number | null,
      lastCorrection: 0,
      lastPlayAttempt: 0,
      /** a local pick waiting for the server's answer */
      pending: null as null | { videoId: string; at: number },
      navigatedTo: null as null | { videoId: string; at: number },
      readySince: 0,
      readyFor: null as string | null,
    };

    const settled = () => {
      const s = usePlayerSession.getState();
      const p = useParty.getState().playback;
      return !!p && s.videoId === p.videoId && sync.readyFor === s.videoId && Date.now() - sync.readySince > SETTLE_MS;
    };
    const send = (msg: Record<string, unknown>) => useParty.getState().send(msg);

    // ---------------------------------------------------------------- remote -> local
    const reconcile = () => {
      const ps = useParty.getState();
      const p = ps.playback;
      if (ps.status !== 'open' || !p) return;
      const s = usePlayerSession.getState();
      const now = Date.now();
      if (!p.videoId) {
        // nothing picked yet: whatever this member is watching becomes the party's video
        if (s.videoId && !sync.pending && partyCan('video')) {
          sync.pending = { videoId: s.videoId, at: now };
          send({ t: 'load', videoId: s.videoId, position: s.controls?.getTime() || 0 });
        }
        return;
      }

      if (sync.pending) {
        if (p.videoId === sync.pending.videoId || now - sync.pending.at > 6000) sync.pending = null;
        else return;
      }

      if (s.videoId !== p.videoId) {
        sync.readyFor = null;
        if (sync.navigatedTo?.videoId === p.videoId && now - sync.navigatedTo.at < 3000) return;
        if (s.mini) s.load(p.videoId);
        else if (s.videoId || window.location.pathname === '/watch') navigateRef.current(`/watch?v=${p.videoId}`);
        else return; // player closed while browsing: the masthead pill offers a way back
        sync.navigatedTo = { videoId: p.videoId, at: now };
        return;
      }

      const el = s.videoEl;
      const controls = s.controls;
      if (!el || !controls || el.readyState < 1) return;
      if (sync.readyFor !== s.videoId) {
        if (el.readyState < 2) return;
        sync.readyFor = s.videoId;
        sync.readySince = now;
      }

      const duration = isFinite(el.duration) ? el.duration : p.meta?.lengthSeconds || Infinity;
      const expected = Math.min(partyPosition(p, ps.offset), duration);
      const atEnd = expected >= duration - 0.5;

      if (ps.settings?.syncRate && el.playbackRate !== p.rate) {
        sync.expectRate = p.rate;
        el.playbackRate = p.rate;
      }

      if (p.playing && el.paused && !atEnd && now - sync.lastPlayAttempt > 2000) {
        sync.lastPlayAttempt = now;
        sync.expectPlay = now;
        controls.play();
      } else if (!p.playing && !el.paused) {
        sync.expectPause = now;
        controls.pause();
      }

      // buffering members aren't yanked around; they catch up once data arrives
      const buffering = p.playing && el.readyState < 3;
      const drift = Math.abs(el.currentTime - expected);
      const limit = p.playing ? DRIFT_PLAYING : DRIFT_PAUSED;
      const cooldown = p.playing ? 2500 : 300;
      if (!buffering && drift > limit && !(atEnd && el.ended) && now - sync.lastCorrection > cooldown) {
        sync.lastCorrection = now;
        sync.expectSeek = { t: expected, at: now };
        controls.seek(expected);
      }
    };

    // ---------------------------------------------------------------- local -> remote
    let el: HTMLVideoElement | null = null;
    const onPlay = () => {
      if (Date.now() - sync.expectPlay < 1500) return;
      if (!settled() || useParty.getState().playback?.playing) return;
      send({ t: 'play', position: el!.currentTime });
    };
    const onPause = () => {
      // ends, hidden tabs and locked phones pause the local video; that's not a party action
      // (a pause pressed in the picture-in-picture window is, even though the page is hidden)
      if (el!.ended || (document.visibilityState === 'hidden' && document.pictureInPictureElement !== el)) return;
      if (Date.now() - sync.expectPause < 1500) return;
      if (!settled() || !useParty.getState().playback?.playing) return;
      send({ t: 'pause', position: el!.currentTime });
    };
    const onSeeked = () => {
      const e = sync.expectSeek;
      if (e && Date.now() - e.at < 3000 && Math.abs(el!.currentTime - e.t) < 1) {
        sync.expectSeek = null;
        return;
      }
      if (!settled()) return;
      const ps = useParty.getState();
      if (ps.playback && Math.abs(partyPosition(ps.playback, ps.offset) - el!.currentTime) < 0.75) return;
      sync.lastCorrection = Date.now();
      send({ t: 'seek', position: el!.currentTime });
    };
    const onRate = () => {
      if (sync.expectRate === el!.playbackRate) {
        sync.expectRate = null;
        return;
      }
      const ps = useParty.getState();
      if (!settled() || !ps.settings?.syncRate || ps.playback?.rate === el!.playbackRate) return;
      send({ t: 'rate', rate: el!.playbackRate });
    };
    const onEnded = () => {
      const s = usePlayerSession.getState();
      if (s.videoId && s.videoId === useParty.getState().playback?.videoId) send({ t: 'ended', videoId: s.videoId });
    };
    const bind = (next: HTMLVideoElement | null) => {
      if (el === next) return;
      if (el) {
        el.removeEventListener('play', onPlay);
        el.removeEventListener('pause', onPause);
        el.removeEventListener('seeked', onSeeked);
        el.removeEventListener('ratechange', onRate);
        el.removeEventListener('ended', onEnded);
      }
      el = next;
      if (el) {
        el.addEventListener('play', onPlay);
        el.addEventListener('pause', onPause);
        el.addEventListener('seeked', onSeeked);
        el.addEventListener('ratechange', onRate);
        el.addEventListener('ended', onEnded);
      }
    };
    bind(usePlayerSession.getState().videoEl);

    // Picking a video anywhere in the app (cards, search, end screen...) picks it for the party
    const unsubPlayer = usePlayerSession.subscribe((s, prev) => {
      if (s.videoEl !== prev.videoEl) bind(s.videoEl);
      if (s.videoId === prev.videoId || !s.videoId) return;
      sync.readyFor = null;
      const ps = useParty.getState();
      if (ps.status !== 'open' || s.videoId === ps.playback?.videoId) return;
      sync.pending = { videoId: s.videoId, at: Date.now() };
      send({ t: 'load', videoId: s.videoId, position: s.startAt || 0 });
    });
    const unsubParty = useParty.subscribe((s, prev) => {
      if (s.playback !== prev.playback || s.status !== prev.status) reconcile();
    });
    const timer = setInterval(reconcile, 250);
    reconcile();

    return () => {
      clearInterval(timer);
      unsubPlayer();
      unsubParty();
      bind(null);
    };
  }, [partyId]);

  return null;
}
