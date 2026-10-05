import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent } from 'react';
import { formatDuration } from '../api/format';
import { api } from '../api/invidious';
import type { SponsorSegment, VideoDetails } from '../api/types';
import type { CardVideo } from '../components/cards/model';
import { useRecordHistory } from '../hooks/useAccount';
import { getResumePosition, toLite } from '../stores/library';
import { usePlayerSession } from '../stores/player';
import { SB_CATEGORIES, useSettings } from '../stores/settings';
import { chapterAt, parseChapters } from './chapters';
import { Engine, type EngineStats, type VariantInfo } from './engine';
import { PIcon } from './icons';
import { MobileChrome } from './MobileChrome';
import { AutoplayCountdown, Bezel, EndScreen, LargePlayButton, SeekOverlay, SponsorSkipButton, StatsForNerds, type BezelState } from './Overlays';
import { ProgressBar } from './ProgressBar';
import { SettingsMenu, type QualityOption } from './SettingsMenu';
import { normalizeAutoCaptions, parseStoryboard, parseVtt, type Cue } from './vtt';
import './player.css';

export interface PlayerProps {
  videoId: string;
  video: VideoDetails | null;
  startAt: number;
  mini: boolean;
  theater: boolean;
  onToggleTheater: () => void;
  onToggleMini: () => void;
  next: CardVideo | null;
  onNext?: () => void;
  onPrev?: () => void;
  endScreen: CardVideo[];
  inPlaylist: boolean;
  onChapterClick?: () => void;
  detailsError?: string | null;
  /** 'mobile' swaps the desktop chrome for app-style touch controls */
  variant?: 'desktop' | 'mobile';
}

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
};

function qualityBadge(h: number): QualityOption['badge'] {
  if (h >= 4320) return '8K';
  if (h >= 2160) return '4K';
  if (h >= 720) return 'HD';
  return undefined;
}

export function Player(props: PlayerProps) {
  const { videoId, video, startAt, mini, theater } = props;
  const mobile = props.variant === 'mobile';
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const settings = useSettings();
  const recordHistory = useRecordHistory();

  const [paused, setPaused] = useState(true);
  const [ended, setEnded] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [active, setActive] = useState(true);
  const [hoverControls, setHoverControls] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [variants, setVariants] = useState<VariantInfo[]>([]);
  const [quality, setQuality] = useState<'auto' | number>('auto');
  const [captionId, setCaptionId] = useState<number | null>(null);
  const [captionCues, setCaptionCues] = useState<Cue[]>([]);
  const [bezel, setBezel] = useState<BezelState | null>(null);
  const [seekFx, setSeekFx] = useState<{ dir: 'back' | 'fwd'; secs: number; n: number } | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrubT, setScrubT] = useState<number | null>(null);
  const [countdownCancelled, setCountdownCancelled] = useState(false);
  const [sleep, setSleep] = useState<number | 'end' | null>(null);
  const [volumeHover, setVolumeHover] = useState(false);
  const [volumeDrag, setVolumeDrag] = useState(false);
  const [skipNotice, setSkipNotice] = useState<{ seg: SponsorSegment; n: number } | null>(null);
  const [pseudoFs, setPseudoFs] = useState(false);
  const [mSheetOpen, setMSheetOpen] = useState(false);
  const skippedRef = useRef<Set<string>>(new Set());
  const hideTimer = useRef<number>();
  const focusedRef = useRef(false);

  const volume = settings.volume;
  const muted = settings.muted;
  const lengthSeconds = video?.lengthSeconds || duration;
  const isLive = !!video?.liveNow;

  // ------------------------------------------------------------------ engine lifecycle
  useEffect(() => {
    const el = videoRef.current!;
    const engine = new Engine(el);
    engineRef.current = engine;
    engine.onTracksChanged = () => setVariants(engine.variants());
    engine.onError = (msg) => setError(msg);
    usePlayerSession.setState({ videoEl: el });
    return () => {
      engine.destroy();
      engineRef.current = null;
      usePlayerSession.setState({ videoEl: null });
    };
  }, []);

  useEffect(() => {
    const el = videoRef.current!;
    const engine = engineRef.current!;
    setError(null);
    setEnded(false);
    setWaiting(true);
    setTime(startAt || 0);
    setDuration(0);
    setBufferedEnd(0);
    setVariants([]);
    setCountdownCancelled(false);
    setNeedsGesture(false);
    skippedRef.current = new Set();
    let start = startAt;
    if (!start) {
      const resume = getResumePosition(videoId);
      if (resume > 5) start = resume;
    }
    el.pause();
    engine.load(videoId, start).then(() => {
      if (engineRef.current !== engine) return;
      const pref = useSettings.getState().quality;
      if (pref !== 'auto') engine.setMaxHeight(pref);
      if (useSettings.getState().autoplayOnLoad || usePlayerSession.getState().mini) {
        el.play().catch(() => setNeedsGesture(true));
      } else setNeedsGesture(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // resume position may be > duration of a finished video: restart from the beginning
  useEffect(() => {
    const el = videoRef.current;
    if (el && duration && el.currentTime >= duration - 1 && !ended) el.currentTime = 0;
  }, [duration, ended]);

  // ------------------------------------------------------------------ media element events
  useEffect(() => {
    const el = videoRef.current!;
    const onPlay = () => {
      setPaused(false);
      setEnded(false);
      setNeedsGesture(false);
      usePlayerSession.getState().setPaused(false);
    };
    const onPause = () => {
      setPaused(true);
      usePlayerSession.getState().setPaused(true);
    };
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onCanPlay = () => setWaiting(false);
    const onDuration = () => setDuration(isFinite(el.duration) ? el.duration : 0);
    const onProgress = () => {
      const b = el.buffered;
      for (let i = 0; i < b.length; i++) if (b.start(i) <= el.currentTime + 0.5 && b.end(i) >= el.currentTime) setBufferedEnd(b.end(i));
    };
    const onEnded = () => setEnded(true);
    const onRate = () => setSpeed(el.playbackRate);
    const onResize = () => engineRef.current && setVariants(engineRef.current.variants());
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('seeked', onCanPlay);
    el.addEventListener('durationchange', onDuration);
    el.addEventListener('loadedmetadata', onDuration);
    el.addEventListener('progress', onProgress);
    el.addEventListener('timeupdate', onProgress);
    el.addEventListener('ended', onEnded);
    el.addEventListener('ratechange', onRate);
    el.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('seeked', onCanPlay);
      el.removeEventListener('durationchange', onDuration);
      el.removeEventListener('loadedmetadata', onDuration);
      el.removeEventListener('progress', onProgress);
      el.removeEventListener('timeupdate', onProgress);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('ratechange', onRate);
      el.removeEventListener('resize', onResize);
    };
  }, []);

  // smooth time updates while playing
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      const el = videoRef.current;
      if (el) {
        const t = el.currentTime;
        if (Math.abs(t - last) > 0.04) {
          last = t;
          setTime(t);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    if (!paused) raf = requestAnimationFrame(tick);
    else if (videoRef.current) setTime(videoRef.current.currentTime);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  // volume / mute / loop / speed sync
  useEffect(() => {
    const el = videoRef.current!;
    el.volume = volume;
    el.muted = muted;
  }, [volume, muted]);
  useEffect(() => {
    videoRef.current!.loop = loop;
  }, [loop]);

  // ------------------------------------------------------------------ imperative controls for other components
  const play = useCallback(() => {
    videoRef.current?.play().catch(() => setNeedsGesture(true));
  }, []);
  const pause = useCallback(() => videoRef.current?.pause(), []);
  const seek = useCallback((t: number) => {
    const el = videoRef.current;
    if (!el) return;
    const d = isFinite(el.duration) ? el.duration : Infinity;
    el.currentTime = Math.max(0, Math.min(t, d - 0.05));
    setTime(el.currentTime);
    setEnded(false);
  }, []);
  const toggle = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused || el.ended) {
      if (el.ended) el.currentTime = 0;
      play();
    } else pause();
  }, [play, pause]);

  useEffect(() => {
    usePlayerSession.getState().setControls({
      play,
      pause,
      toggle,
      seek,
      getTime: () => videoRef.current?.currentTime ?? 0,
      isPaused: () => videoRef.current?.paused ?? true,
    });
    return () => usePlayerSession.getState().setControls(null);
  }, [play, pause, toggle, seek]);

  // seek requests from the watch page (timestamps in description/comments)
  const seekRequest = usePlayerSession((s) => s.seekRequest);
  useEffect(() => {
    if (seekRequest) {
      seek(seekRequest.t);
      play();
      rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [seekRequest, seek, play]);

  // ------------------------------------------------------------------ derived data
  const chapters = useMemo(() => (video ? parseChapters(video.description, video.lengthSeconds || duration) : []), [video, duration]);
  const currentChapter = chapters.length ? chapterAt(chapters, scrubT ?? time) : undefined;

  const { data: storyboard = [] } = useQuery({
    queryKey: ['storyboard', videoId],
    queryFn: async () => parseStoryboard(await api.storyboardVtt(videoId, 90)),
    staleTime: Infinity,
    retry: false,
    enabled: !!video && !video.liveNow,
  });

  const sbEnabled = settings.sponsorblock;
  const { data: cfg } = useQuery({ queryKey: ['x-config'], queryFn: api.config, staleTime: Infinity });
  const { data: rawSegments = [] } = useQuery({
    queryKey: ['sponsorblock', videoId],
    queryFn: () => api.sponsorSegments(videoId),
    enabled: sbEnabled && cfg?.sponsorblock !== false,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
  const segments = useMemo(
    () => (sbEnabled ? rawSegments.filter((s) => (settings.sbCategories[s.category as keyof typeof settings.sbCategories] ?? 'off') !== 'off') : []),
    [rawSegments, sbEnabled, settings.sbCategories],
  );

  // SponsorBlock auto skip / manual skip button
  const [manualSeg, setManualSeg] = useState<SponsorSegment | null>(null);
  useEffect(() => {
    if (!segments.length || scrubT !== null) {
      setManualSeg(null);
      return;
    }
    let manual: SponsorSegment | null = null;
    for (const s of segments) {
      if (s.actionType === 'poi' || s.actionType === 'full') continue;
      const [a, b] = s.segment;
      if (time >= a && time < b - 0.3) {
        const action = settings.sbCategories[s.category as keyof typeof settings.sbCategories];
        if (action === 'skip' && s.actionType === 'skip' && !skippedRef.current.has(s.UUID)) {
          skippedRef.current.add(s.UUID);
          seek(b);
          setSkipNotice({ seg: s, n: Date.now() });
          return;
        }
        if (action === 'manual' || (action === 'skip' && skippedRef.current.has(s.UUID))) manual = s;
        if (s.actionType === 'mute' && videoRef.current) videoRef.current.muted = true;
      }
    }
    setManualSeg(manual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(time * 4), segments]);

  useEffect(() => {
    if (!skipNotice) return;
    const t = setTimeout(() => setSkipNotice(null), 5000);
    return () => clearTimeout(t);
  }, [skipNotice]);

  // ------------------------------------------------------------------ captions
  const captionTracks = video?.captions ?? [];
  useEffect(() => {
    setCaptionId(null);
    setCaptionCues([]);
    if (!video || !captionTracks.length || !useSettings.getState().captions) return;
    const lang = useSettings.getState().captionLang;
    let idx = captionTracks.findIndex((c) => c.language_code === lang && !/auto-generated/i.test(c.label));
    if (idx < 0) idx = captionTracks.findIndex((c) => c.language_code === lang);
    if (idx < 0) idx = captionTracks.findIndex((c) => !/auto-generated/i.test(c.label));
    if (idx >= 0) setCaptionId(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.videoId]);

  useEffect(() => {
    if (captionId === null || !captionTracks[captionId]) {
      setCaptionCues([]);
      return;
    }
    let cancelled = false;
    const track = captionTracks[captionId];
    fetch(track.url)
      .then((r) => r.text())
      .then((txt) => {
        if (cancelled) return;
        const cues = parseVtt(txt);
        setCaptionCues(/auto-generated/i.test(track.label) ? normalizeAutoCaptions(cues) : cues);
      })
      .catch(() => setCaptionCues([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionId, video?.videoId]);

  const activeCaptions = useMemo(() => {
    if (!captionCues.length) return [];
    const list = captionCues.filter((c) => time >= c.start && time < c.end);
    return list.slice(-2);
  }, [captionCues, time]);

  const toggleCaptions = useCallback(() => {
    if (!captionTracks.length) return;
    setCaptionId((cur) => {
      const next =
        cur !== null
          ? null
          : Math.max(
              0,
              captionTracks.findIndex((c) => c.language_code === useSettings.getState().captionLang && !/auto-generated/i.test(c.label)),
            );
      useSettings.getState().set({ captions: next !== null });
      if (next !== null) useSettings.getState().set({ captionLang: captionTracks[next].language_code });
      setBezel({ icon: 'subtitles', text: next !== null ? `${captionTracks[next].label}` : 'Subtitles/closed captions off', n: Date.now() });
      return next;
    });
  }, [captionTracks]);

  // ------------------------------------------------------------------ quality
  const qualities = useMemo<QualityOption[]>(() => {
    const byHeight = new Map<number, VariantInfo>();
    for (const v of variants) {
      const cur = byHeight.get(v.height);
      if (!cur || v.fps > cur.fps) byHeight.set(v.height, v);
    }
    return [...byHeight.values()]
      .sort((a, b) => b.height - a.height)
      .map((v) => ({
        height: v.height,
        label: `${Math.min(v.height, v.width) || v.height}p${v.fps > 30 ? Math.round(v.fps) : ''}`,
        badge: qualityBadge(Math.min(v.height, v.width) || v.height),
      }));
  }, [variants]);
  const activeVariant = variants.find((v) => v.active);
  const autoHeight = activeVariant ? Math.min(activeVariant.height, activeVariant.width) || activeVariant.height : undefined;

  const applyQuality = (q: 'auto' | number) => {
    setQuality(q);
    engineRef.current?.setQuality(q === 'auto' ? null : q);
    useSettings.getState().set({ quality: q });
  };

  // ------------------------------------------------------------------ sleep timer
  useEffect(() => {
    if (typeof sleep !== 'number') return;
    const t = setTimeout(() => {
      pause();
      setSleep(null);
    }, sleep * 60 * 1000);
    return () => clearTimeout(t);
  }, [sleep, pause]);

  // ------------------------------------------------------------------ end of video
  const willAutoplay = ended && !loop && sleep !== 'end' && !!props.next && (props.inPlaylist || settings.autoplayNext) && !countdownCancelled;
  useEffect(() => {
    if (ended && props.inPlaylist && props.next && !loop && sleep !== 'end') props.onNext?.();
    if (ended && sleep === 'end') setSleep(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);

  // ------------------------------------------------------------------ history
  useEffect(() => {
    if (!video) return;
    const lite = toLite(video);
    const save = () => {
      const el = videoRef.current;
      if (el && el.currentTime > 0) recordHistory(lite, el.currentTime);
    };
    const iv = setInterval(() => !videoRef.current?.paused && save(), 5000);
    const onHide = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', save);
    return () => {
      save();
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', save);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.videoId]);
  useEffect(() => {
    if (video && paused && time > 0) recordHistory(toLite(video), time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // ------------------------------------------------------------------ media session
  useEffect(() => {
    if (!('mediaSession' in navigator) || !video) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: video.title,
      artist: video.author,
      artwork: [{ src: `/vi/${video.videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' }],
    });
    navigator.mediaSession.setActionHandler('play', play);
    navigator.mediaSession.setActionHandler('pause', pause);
    navigator.mediaSession.setActionHandler('seekbackward', () => seek((videoRef.current?.currentTime ?? 0) - 10));
    navigator.mediaSession.setActionHandler('seekforward', () => seek((videoRef.current?.currentTime ?? 0) + 10));
    navigator.mediaSession.setActionHandler('nexttrack', props.onNext ? () => props.onNext?.() : null);
    navigator.mediaSession.setActionHandler('previoustrack', props.onPrev ? () => props.onPrev?.() : null);
  }, [video, play, pause, seek, props]);

  // ------------------------------------------------------------------ fullscreen
  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (mini && document.fullscreenElement === rootRef.current) document.exitFullscreen();
    if (mini) setPseudoFs(false);
  }, [mini]);

  // Phones: real full screen + orientation lock where supported, otherwise a CSS "full window" mode
  const setMobileFullscreen = useCallback(async (on: boolean) => {
    const root = rootRef.current;
    const el = videoRef.current;
    if (!root) return;
    const orientation = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    if (!on) {
      setPseudoFs(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      try {
        orientation?.unlock?.();
      } catch {
        /* not supported */
      }
      return;
    }
    if (document.fullscreenEnabled && root.requestFullscreen) {
      try {
        await root.requestFullscreen({ navigationUI: 'hide' });
        const portrait = !!el && el.videoHeight > el.videoWidth;
        await orientation?.lock?.(portrait ? 'portrait' : 'landscape').catch(() => undefined);
        return;
      } catch {
        /* fall back below */
      }
    }
    setPseudoFs(true);
  }, []);

  // Rotating the phone to landscape on the watch page goes full screen; rotating back leaves it
  useEffect(() => {
    if (!mobile) return;
    const mql = matchMedia('(orientation: landscape) and (max-height: 520px)');
    const on = () => {
      if (usePlayerSession.getState().mini) return;
      if (mql.matches) {
        if (!document.fullscreenElement) setPseudoFs(true);
      } else setPseudoFs(false);
    };
    on();
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [mobile, mini]);
  useEffect(() => {
    if (!pseudoFs) return;
    document.documentElement.classList.add('player-pseudo-fs');
    return () => document.documentElement.classList.remove('player-pseudo-fs');
  }, [pseudoFs]);
  const isFullscreen = fullscreen || pseudoFs;

  // ------------------------------------------------------------------ autohide
  const poke = useCallback(() => {
    setActive(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      // the app keeps its controls up while paused
      if (!(mobile && videoRef.current?.paused)) setActive(false);
    }, 3000);
  }, [mobile]);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  const showChrome = mobile
    ? (active && !mini) || ended || scrubT !== null || mSheetOpen
    : paused || active || hoverControls || settingsOpen || ended || volumeDrag || scrubT !== null;
  // Pausing from outside the controls (headphones, lock screen) brings the controls back
  useEffect(() => {
    if (mobile && paused) {
      setActive(true);
      clearTimeout(hideTimer.current);
    }
  }, [mobile, paused]);

  // ------------------------------------------------------------------ feedback helpers
  const flash = (b: Omit<BezelState, 'n'>) => setBezel({ ...b, n: Date.now() });
  const changeVolume = (delta: number) => {
    const v = Math.max(0, Math.min(1, Math.round((volume + delta) * 100) / 100));
    settings.set({ volume: v, muted: v === 0 ? true : false });
    flash({ icon: v === 0 ? 'volumeMute' : v < 0.5 ? 'volumeLow' : 'volumeHigh', text: `${Math.round(v * 100)}%` });
  };
  const toggleMute = () => {
    const m = !muted;
    settings.set({ muted: m, volume: !m && volume === 0 ? 0.5 : volume });
    flash({ icon: m ? 'volumeMute' : 'volumeHigh' });
  };
  const seekBy = (secs: number) => {
    const el = videoRef.current;
    if (!el) return;
    seek(el.currentTime + secs);
    setSeekFx((prev) => ({ dir: secs < 0 ? 'back' : 'fwd', secs: prev && prev.dir === (secs < 0 ? 'back' : 'fwd') && Date.now() - prev.n < 700 ? prev.secs + Math.abs(secs) : Math.abs(secs), n: Date.now() }));
  };
  const setRate = (r: number) => {
    const el = videoRef.current;
    if (!el) return;
    const v = Math.max(0.25, Math.min(2, r));
    el.playbackRate = v;
    setSpeed(v);
  };

  // ------------------------------------------------------------------ keyboard shortcuts
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      focusedRef.current = !!rootRef.current?.contains(e.target as Node);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = videoRef.current;
    if (!el) return;
    const k = e.key;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (mini) {
      if (k === 'k' || (k === ' ' && !(e.target as HTMLElement).closest('button'))) {
        handled();
        toggle();
      } else if (k === 'i') {
        handled();
        props.onToggleMini();
      }
      return;
    }
    switch (k) {
      case ' ':
        if ((e.target as HTMLElement).closest('button, a')) return;
        handled();
        toggle();
        flash({ icon: el.paused ? 'play' : 'pause' });
        break;
      case 'k':
      case 'K':
        handled();
        toggle();
        flash({ icon: el.paused ? 'play' : 'pause' });
        break;
      case 'j':
      case 'J':
        handled();
        seekBy(-10);
        break;
      case 'l':
      case 'L':
        handled();
        seekBy(10);
        break;
      case 'ArrowLeft':
        handled();
        seekBy(-5);
        break;
      case 'ArrowRight':
        handled();
        seekBy(5);
        break;
      case 'ArrowUp':
        if (!focusedRef.current && !fullscreen) return;
        handled();
        changeVolume(0.05);
        break;
      case 'ArrowDown':
        if (!focusedRef.current && !fullscreen) return;
        handled();
        changeVolume(-0.05);
        break;
      case 'm':
      case 'M':
        handled();
        toggleMute();
        break;
      case 'f':
      case 'F':
        handled();
        toggleFullscreen();
        break;
      case 't':
      case 'T':
        if (fullscreen) return;
        handled();
        props.onToggleTheater();
        break;
      case 'i':
      case 'I':
        handled();
        props.onToggleMini();
        break;
      case 'c':
      case 'C':
        handled();
        toggleCaptions();
        break;
      case 'Home':
        handled();
        seek(0);
        break;
      case 'End':
        handled();
        seek(el.duration);
        break;
      case ',':
        if (!el.paused) return;
        handled();
        seek(el.currentTime - 1 / 30);
        break;
      case '.':
        if (!el.paused) return;
        handled();
        seek(el.currentTime + 1 / 30);
        break;
      case '<':
        handled();
        setRate(Math.round((speed - 0.25) * 4) / 4);
        flash({ icon: null, text: `${Math.max(0.25, speed - 0.25)}x` });
        break;
      case '>':
        handled();
        setRate(Math.round((speed + 0.25) * 4) / 4);
        flash({ icon: null, text: `${Math.min(2, speed + 0.25)}x` });
        break;
      case 'N':
        if (e.shiftKey && props.onNext) {
          handled();
          props.onNext();
        }
        break;
      case 'P':
        if (e.shiftKey && props.onPrev) {
          handled();
          props.onPrev();
        }
        break;
      case 'Escape':
        setSettingsOpen(false);
        setContextMenu(null);
        break;
      default:
        if (/^[0-9]$/.test(k) && el.duration) {
          handled();
          seek((el.duration * Number(k)) / 10);
        }
    }
    poke();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // ------------------------------------------------------------------ stats for nerds
  useEffect(() => {
    if (!statsOpen) return;
    const upd = () => engineRef.current && setStats(engineRef.current.stats());
    upd();
    const iv = setInterval(upd, 1000);
    return () => clearInterval(iv);
  }, [statsOpen]);

  // ------------------------------------------------------------------ click handling on the video surface
  const clickTimer = useRef<number>();
  const onSurfaceClick = (e: RMouseEvent) => {
    if (settingsOpen || contextMenu) {
      setSettingsOpen(false);
      setContextMenu(null);
      return;
    }
    if (mini) return;
    if (e.detail > 1) return;
    clearTimeout(clickTimer.current);
    toggle();
    flash({ icon: videoRef.current?.paused ? 'play' : 'pause' });
  };
  const onSurfaceDblClick = () => {
    if (!mini) toggleFullscreen();
  };

  const rootClass = [
    'html5-video-player',
    paused ? 'paused-mode' : 'playing-mode',
    ended ? 'ended-mode' : '',
    showChrome ? '' : 'ytp-autohide',
    isFullscreen ? 'ytp-fullscreen' : '',
    pseudoFs ? 'ytp-pseudo-fs' : '',
    mobile ? 'ytp-mobile' : '',
    mini ? 'ytp-mini' : '',
    theater ? 'ytp-big-mode-off' : '',
    chapters.length ? 'ytp-has-chapters' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const volumeIcon = muted || volume === 0 ? 'volumeMute' : volume < 0.5 ? 'volumeLow' : 'volumeHigh';
  const shownTime = scrubT ?? time;
  const playerH = rootRef.current?.clientHeight ?? 400;
  const settingsBadge = quality === 'auto' ? qualityBadge(autoHeight ?? 0) : qualityBadge(quality);

  return (
    <div
      ref={rootRef}
      className={rootClass}
      tabIndex={-1}
      onMouseMove={mobile ? undefined : poke}
      onMouseLeave={() => !mobile && !paused && setActive(false)}
      onContextMenu={(e) => {
        if (mini || mobile) return;
        e.preventDefault();
        const r = rootRef.current!.getBoundingClientRect();
        setContextMenu({ x: Math.min(e.clientX - r.left, r.width - 260), y: Math.min(e.clientY - r.top, r.height - 220) });
      }}
      style={{ '--player-h': `${playerH}px` } as React.CSSProperties}
    >
      <div className="html5-video-container" onClick={mobile ? undefined : onSurfaceClick} onDoubleClick={mobile ? undefined : onSurfaceDblClick}>
        <video ref={videoRef} className="video-stream" playsInline preload="auto" crossOrigin="anonymous" />
      </div>

      {!mini && activeCaptions.length > 0 && (
        <div className={'ytp-caption-window-container' + (showChrome ? ' raised' : '')}>
          <div className="ytp-caption-window">
            {activeCaptions.map((c, i) => (
              <div key={i} className="captions-text">
                {c.text.split('\n').map((line, j) => (
                  <span key={j} className="caption-visual-line">
                    <span className="ytp-caption-segment">{line.replace(/<[^>]+>/g, '')}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {waiting && !paused && !error && !props.detailsError && (
        <div className="ytp-spinner">
          <svg viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" />
          </svg>
        </div>
      )}
      {(error || props.detailsError) && (
        <div className="ytp-error">
          <div className="ytp-error-content">
            <div className="ytp-error-icon">!</div>
            <div>
              <div className="ytp-error-title">{props.detailsError ? 'Video unavailable' : 'An error occurred'}</div>
              <div className="ytp-error-sub">{props.detailsError || error}</div>
            </div>
          </div>
        </div>
      )}

      {!mini && !mobile && bezel && <Bezel state={bezel} />}
      {!mini && !mobile && seekFx && <SeekOverlay key={seekFx.n} dir={seekFx.dir} secs={seekFx.secs} />}
      {needsGesture && !mini && <LargePlayButton onClick={() => play()} thumb={`/vi/${videoId}/maxresdefault.jpg`} />}

      {!mini && manualSeg && (
        <SponsorSkipButton
          label={`Skip ${SB_CATEGORIES.find((c) => c.id === manualSeg.category)?.label ?? 'segment'}`}
          onClick={() => {
            skippedRef.current.add(manualSeg.UUID);
            seek(manualSeg.segment[1]);
          }}
          raised={showChrome}
        />
      )}
      {!mini && skipNotice && (
        <div className={'ytp-sb-notice' + (showChrome ? ' raised' : '')}>
          <span>Skipped {SB_CATEGORIES.find((c) => c.id === skipNotice.seg.category)?.label.toLowerCase() ?? 'segment'}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              seek(skipNotice.seg.segment[0]);
              setSkipNotice(null);
            }}
          >
            Undo
          </button>
        </div>
      )}

      {!mini && !mobile && ended && !loop && (willAutoplay && props.next && !props.inPlaylist ? (
        <AutoplayCountdown next={props.next} onCancel={() => setCountdownCancelled(true)} onPlay={() => props.onNext?.()} />
      ) : (
        !props.inPlaylist && <EndScreen videos={props.endScreen} onReplay={() => { seek(0); play(); }} />
      ))}

      {!mini && statsOpen && <StatsForNerds videoId={videoId} stats={stats} volume={volume} muted={muted} onClose={() => setStatsOpen(false)} />}

      {mobile && !mini && (
        <MobileChrome
          rootRef={rootRef}
          title={video?.title}
          show={showChrome}
          setShow={(on) => {
            if (on) poke();
            else {
              clearTimeout(hideTimer.current);
              setActive(false);
            }
          }}
          paused={paused}
          ended={ended}
          waiting={waiting}
          time={shownTime}
          duration={duration || lengthSeconds}
          bufferedEnd={bufferedEnd}
          isLive={isLive}
          chapters={chapters}
          currentChapter={currentChapter}
          segments={segments}
          storyboard={storyboard}
          fullscreen={isFullscreen}
          onToggle={toggle}
          onSeek={(t) => {
            seek(t);
            if (ended) play();
          }}
          onSeekBy={(secs) => seek((videoRef.current?.currentTime ?? 0) + secs)}
          onScrub={setScrubT}
          onPrev={props.onPrev}
          onNext={props.onNext}
          hasNext={!!props.next}
          onMinimize={() => (isFullscreen ? setMobileFullscreen(false) : props.onToggleMini())}
          onFullscreen={setMobileFullscreen}
          captions={captionTracks.map((c, i) => ({ id: i, label: c.label }))}
          caption={captionId}
          onCaption={(id) => {
            setCaptionId(id);
            settings.set({ captions: id !== null, ...(id !== null ? { captionLang: captionTracks[id].language_code } : {}) });
          }}
          onToggleCaptions={toggleCaptions}
          qualities={qualities}
          quality={quality}
          autoHeight={autoHeight}
          onQuality={applyQuality}
          speed={speed}
          onSpeed={setRate}
          loop={loop}
          onLoop={setLoop}
          sleep={sleep}
          onSleep={setSleep}
          autoplayNext={settings.autoplayNext}
          onAutoplayNext={(on) => settings.set({ autoplayNext: on })}
          inPlaylist={props.inPlaylist}
          upNext={props.next}
          showUpNext={ended && !loop && willAutoplay && !props.inPlaylist}
          onCancelUpNext={() => setCountdownCancelled(true)}
          onStats={() => setStatsOpen(true)}
          onSheetChange={setMSheetOpen}
        />
      )}

      {/* bottom chrome */}
      {!mini && !mobile && <div className="ytp-gradient-bottom" />}
      {!mini && !mobile && (
        <div className="ytp-chrome-bottom" onMouseEnter={() => setHoverControls(true)} onMouseLeave={() => setHoverControls(false)} onClick={(e) => e.stopPropagation()}>
          {!isLive && (
            <ProgressBar
              duration={duration || lengthSeconds}
              currentTime={time}
              bufferedEnd={bufferedEnd}
              chapters={chapters}
              segments={segments}
              storyboard={storyboard}
              onSeek={(t) => {
                seek(t);
                if (ended) play();
              }}
              onScrub={setScrubT}
              boundsRef={rootRef}
            />
          )}
          <div className="ytp-chrome-controls">
            <div className="ytp-left-controls">
              {props.onPrev && (
                <button className="ytp-button ytp-prev-button" onClick={props.onPrev} data-tooltip="Previous (SHIFT+p)" data-tooltip-pos="top" aria-label="Previous">
                  <PIcon name="prev" />
                </button>
              )}
              <button
                className="ytp-button ytp-play-button"
                onClick={toggle}
                data-tooltip={ended ? 'Replay' : paused ? 'Play (k)' : 'Pause (k)'}
                data-tooltip-pos="top"
                aria-label={paused ? 'Play' : 'Pause'}
              >
                <PIcon name={ended ? 'replay' : paused ? 'play' : 'pause'} />
              </button>
              {props.next && (
                <button className="ytp-button ytp-next-button" onClick={props.onNext} data-tooltip="Next (SHIFT+n)" data-tooltip-pos="top" aria-label="Next">
                  <PIcon name="next" />
                </button>
              )}
              <span
                className={'ytp-volume-area' + (volumeHover || volumeDrag ? ' expanded' : '')}
                onMouseEnter={() => setVolumeHover(true)}
                onMouseLeave={() => setVolumeHover(false)}
              >
                <button className="ytp-button ytp-mute-button" onClick={toggleMute} data-tooltip={muted ? 'Unmute (m)' : 'Mute (m)'} data-tooltip-pos="top" aria-label="Mute">
                  <PIcon name={volumeIcon} />
                </button>
                <div
                  className="ytp-volume-panel"
                  role="slider"
                  aria-label="Volume"
                  aria-valuenow={Math.round((muted ? 0 : volume) * 100)}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setVolumeDrag(true);
                    const r = e.currentTarget.getBoundingClientRect();
                    const v = Math.max(0, Math.min(1, (e.clientX - r.left - 6) / (r.width - 12)));
                    settings.set({ volume: v, muted: v === 0 });
                  }}
                  onPointerMove={(e) => {
                    if (!volumeDrag) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    const v = Math.max(0, Math.min(1, (e.clientX - r.left - 6) / (r.width - 12)));
                    settings.set({ volume: v, muted: v === 0 });
                  }}
                  onPointerUp={() => setVolumeDrag(false)}
                >
                  <div className="ytp-volume-slider">
                    <div className="ytp-volume-slider-track" style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
                    <div className="ytp-volume-slider-handle" style={{ left: `${(muted ? 0 : volume) * 100}%` }} />
                  </div>
                </div>
              </span>
              <div className="ytp-time-display">
                {isLive ? (
                  <span className="ytp-live-badge">
                    <span className="ytp-live-dot" />
                    LIVE
                  </span>
                ) : (
                  <span className="ytp-time-wrapper">
                    <span className="ytp-time-current">{formatDuration(shownTime)}</span>
                    <span className="ytp-time-separator"> / </span>
                    <span className="ytp-time-duration">{formatDuration(duration || lengthSeconds)}</span>
                  </span>
                )}
              </div>
              {currentChapter && (
                <button className="ytp-chapter-container" onClick={props.onChapterClick} data-tooltip="View chapter" data-tooltip-pos="top">
                  <span className="ytp-chapter-dot">•</span>
                  <span className="ytp-chapter-title-content">{currentChapter.title}</span>
                  <span className="ytp-chapter-chevron">
                    <PIcon name="chevronRight" />
                  </span>
                </button>
              )}
            </div>
            <div className="ytp-right-controls">
              {!props.inPlaylist && (
                <button
                  className="ytp-button ytp-autonav-toggle"
                  onClick={() => settings.set({ autoplayNext: !settings.autoplayNext })}
                  data-tooltip={`Autoplay is ${settings.autoplayNext ? 'on' : 'off'}`}
                  data-tooltip-pos="top"
                  aria-label="Autoplay"
                >
                  <div className={'ytp-autonav-toggle-button' + (settings.autoplayNext ? ' on' : '')}>
                    <div className="ytp-autonav-knob">
                      <svg viewBox="0 0 12 12" width="12" height="12">
                        {settings.autoplayNext ? <path d="M3 1.5v9L10 6z" fill="#000" /> : <path d="M3 2h2v8H3zM7 2h2v8H7z" fill="#000" />}
                      </svg>
                    </div>
                  </div>
                </button>
              )}
              {captionTracks.length > 0 && (
                <button
                  className={'ytp-button ytp-subtitles-button' + (captionId !== null ? ' active' : '')}
                  onClick={toggleCaptions}
                  data-tooltip="Subtitles/closed captions (c)"
                  data-tooltip-pos="top"
                  aria-pressed={captionId !== null}
                >
                  <PIcon name="subtitles" />
                </button>
              )}
              <button
                className={'ytp-button ytp-settings-button' + (settingsOpen ? ' open' : '')}
                onClick={() => setSettingsOpen((o) => !o)}
                data-tooltip={settingsOpen ? undefined : 'Settings'}
                data-tooltip-pos="top"
                aria-label="Settings"
              >
                <PIcon name="settings" />
                {settingsBadge && <span className={'ytp-settings-badge' + (settingsBadge === 'HD' ? ' hd' : '')}>{settingsBadge}</span>}
              </button>
              {!fullscreen && (
                <button className="ytp-button ytp-miniplayer-button" onClick={props.onToggleMini} data-tooltip="Miniplayer (i)" data-tooltip-pos="top" aria-label="Miniplayer">
                  <PIcon name="miniplayer" />
                </button>
              )}
              {!fullscreen && (
                <button
                  className="ytp-button ytp-size-button"
                  onClick={props.onToggleTheater}
                  data-tooltip={theater ? 'Default view (t)' : 'Theater mode (t)'}
                  data-tooltip-pos="top"
                  aria-label="Theater mode"
                >
                  <PIcon name={theater ? 'defaultView' : 'theater'} />
                </button>
              )}
              <button
                className="ytp-button ytp-fullscreen-button"
                onClick={toggleFullscreen}
                data-tooltip={fullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}
                data-tooltip-pos="top"
                aria-label="Full screen"
              >
                <PIcon name={fullscreen ? 'exitFullscreen' : 'fullscreen'} />
              </button>
            </div>
          </div>
        </div>
      )}

      {mini && (
        <div className="ytp-mini-progress">
          <div style={{ width: `${(duration ? time / duration : 0) * 100}%` }} />
        </div>
      )}

      {settingsOpen && !mini && !mobile && (
        <SettingsMenu
          qualities={qualities}
          quality={quality}
          autoHeight={autoHeight}
          onQuality={applyQuality}
          speed={speed}
          onSpeed={setRate}
          captions={captionTracks.map((c, i) => ({ id: i, label: c.label }))}
          caption={captionId}
          onCaption={(id) => {
            setCaptionId(id);
            settings.set({ captions: id !== null, ...(id !== null ? { captionLang: captionTracks[id].language_code } : {}) });
          }}
          sleep={sleep}
          onSleep={setSleep}
          ambient={settings.ambientMode}
          onAmbient={(on) => settings.set({ ambientMode: on })}
          loop={loop}
          onLoop={setLoop}
          maxHeight={Math.max(200, playerH - 80)}
        />
      )}

      {contextMenu && !mini && (
        <div className="ytp-contextmenu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
          <div className="ytp-menuitem" onClick={() => (setLoop(!loop), setContextMenu(null))}>
            <div className="ytp-menuitem-label">Loop</div>
            <div className="ytp-menuitem-content">
              <div className={'ytp-menuitem-toggle-checkbox' + (loop ? ' on' : '')} />
            </div>
          </div>
          <div
            className="ytp-menuitem"
            onClick={() => {
              navigator.clipboard?.writeText(`https://youtu.be/${videoId}`);
              setContextMenu(null);
            }}
          >
            <div className="ytp-menuitem-label">Copy video URL</div>
          </div>
          <div
            className="ytp-menuitem"
            onClick={() => {
              navigator.clipboard?.writeText(`https://youtu.be/${videoId}?t=${Math.floor(time)}`);
              setContextMenu(null);
            }}
          >
            <div className="ytp-menuitem-label">Copy video URL at current time</div>
          </div>
          <div
            className="ytp-menuitem"
            onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/watch?v=${videoId}`);
              setContextMenu(null);
            }}
          >
            <div className="ytp-menuitem-label">Copy instance URL</div>
          </div>
          <div className="ytp-menuitem" onClick={() => (setStatsOpen(true), setContextMenu(null))}>
            <div className="ytp-menuitem-label">Stats for nerds</div>
          </div>
        </div>
      )}
      {contextMenu && <div className="ytp-contextmenu-scrim" onClick={() => setContextMenu(null)} onContextMenu={(e) => (e.preventDefault(), setContextMenu(null))} />}
    </div>
  );
}
