import type shakaNs from 'shaka-player';
import { dashManifestUrl, localizeStreamUrl, progressiveUrl } from '../api/invidious';

type Shaka = typeof shakaNs;
let shakaPromise: Promise<Shaka> | null = null;

function loadShaka(): Promise<Shaka> {
  if (!shakaPromise) {
    shakaPromise = import('shaka-player').then((m) => {
      const shaka = (m as unknown as { default: Shaka }).default ?? (m as unknown as Shaka);
      shaka.polyfill.installAll();
      return shaka;
    });
  }
  return shakaPromise;
}

export interface VariantInfo {
  id: number;
  height: number;
  width: number;
  fps: number;
  bandwidth: number;
  videoCodec: string;
  audioCodec: string;
  active: boolean;
}

export interface EngineStats {
  width: number;
  height: number;
  droppedFrames: number;
  decodedFrames: number;
  estimatedBandwidth: number;
  streamBandwidth: number;
  bufferAhead: number;
  videoCodec: string;
  audioCodec: string;
  itag?: string;
  mode: 'dash' | 'progressive';
}

/**
 * Thin wrapper around Shaka Player that plays a video through invidious-companion's DASH
 * manifest and falls back to the progressive 360p stream if DASH fails.
 */
export class Engine {
  private player: shakaNs.Player | null = null;
  private video: HTMLVideoElement;
  private destroyed = false;
  mode: 'dash' | 'progressive' = 'dash';
  onTracksChanged: () => void = () => {};
  onError: (msg: string) => void = () => {};

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  async load(videoId: string, startTime: number, opts: { live?: boolean; hlsUrl?: string } = {}) {
    const shaka = await loadShaka();
    if (this.destroyed) return;
    if (!shaka.Player.isBrowserSupported()) {
      this.loadProgressive(videoId, startTime);
      return;
    }
    if (!this.player) {
      this.player = new shaka.Player();
      await this.player.attach(this.video);
      this.player.configure({
        abr: { enabled: true, switchInterval: 4, bandwidthUpgradeTarget: 0.85 },
        streaming: {
          bufferingGoal: 40,
          rebufferingGoal: 1.5,
          bufferBehind: 30,
          retryParameters: { maxAttempts: 4, baseDelay: 500, backoffFactor: 2, timeout: 30000 },
        },
        manifest: { retryParameters: { maxAttempts: 3, baseDelay: 500, backoffFactor: 2, timeout: 20000 } },
        preferredVideoCodecs: ['av01', 'vp09', 'vp9', 'avc1'],
        preferredAudioCodecs: ['opus', 'mp4a'],
      });
      this.player.addEventListener('variantchanged', () => this.onTracksChanged());
      this.player.addEventListener('adaptation', () => this.onTracksChanged());
      this.player.addEventListener('trackschanged', () => this.onTracksChanged());
      this.player.addEventListener('error', (e) => {
        const detail = (e as unknown as { detail?: { code?: number } }).detail;
        console.warn('[shaka] error', detail);
      });
    }
    this.mode = 'dash';
    try {
      const url = opts.live && opts.hlsUrl ? localizeStreamUrl(opts.hlsUrl) : dashManifestUrl(videoId);
      await this.player.load(url, opts.live ? undefined : startTime || undefined);
      if (this.destroyed) return;
      this.onTracksChanged();
    } catch (err) {
      if (this.destroyed) return;
      const code = (err as { code?: number })?.code;
      // 7000 = LOAD_INTERRUPTED (a newer load replaced this one)
      if (code === 7000) return;
      console.warn('[engine] DASH failed, falling back to progressive', err);
      await this.player?.unload().catch(() => undefined);
      this.loadProgressive(videoId, startTime);
    }
  }

  private loadProgressive(videoId: string, startTime: number) {
    this.mode = 'progressive';
    this.video.src = progressiveUrl(videoId, 18);
    if (startTime) this.video.currentTime = startTime;
    this.video.addEventListener(
      'error',
      () => {
        if (this.mode === 'progressive') this.onError('This video could not be played. Please try again later.');
      },
      { once: true },
    );
    this.onTracksChanged();
  }

  variants(): VariantInfo[] {
    if (!this.player || this.mode !== 'dash') {
      const v = this.video;
      return v.videoHeight
        ? [{ id: 18, height: v.videoHeight, width: v.videoWidth, fps: 30, bandwidth: 0, videoCodec: 'avc1', audioCodec: 'mp4a', active: true }]
        : [];
    }
    return this.player
      .getVariantTracks()
      .filter((t) => t.height)
      .map((t) => ({
        id: t.id,
        height: t.height || 0,
        width: t.width || 0,
        fps: t.frameRate || 30,
        bandwidth: t.bandwidth,
        videoCodec: t.videoCodec || '',
        audioCodec: t.audioCodec || '',
        active: t.active,
      }));
  }

  /** null = automatic (ABR); otherwise lock to the best variant at that height. */
  setQuality(height: number | null) {
    if (!this.player || this.mode !== 'dash') return;
    if (height === null) {
      this.player.configure({ abr: { enabled: true, restrictions: { maxHeight: Infinity } } });
      return;
    }
    const tracks = this.player.getVariantTracks().filter((t) => t.height === height);
    if (!tracks.length) return;
    const best = tracks.sort((a, b) => b.bandwidth - a.bandwidth)[0];
    this.player.configure({ abr: { enabled: false } });
    this.player.selectVariantTrack(best, true, 2);
  }

  /** Applies an upper height limit while keeping ABR on (used for the saved quality preference). */
  setMaxHeight(h: number | null) {
    if (!this.player) return;
    this.player.configure({ abr: { enabled: true, restrictions: { maxHeight: h ?? Infinity } } });
  }

  stats(): EngineStats {
    const v = this.video;
    const q = v.getVideoPlaybackQuality?.();
    let bufferAhead = 0;
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime) bufferAhead = v.buffered.end(i) - v.currentTime;
    }
    if (!this.player || this.mode !== 'dash') {
      return {
        width: v.videoWidth,
        height: v.videoHeight,
        droppedFrames: q?.droppedVideoFrames ?? 0,
        decodedFrames: q?.totalVideoFrames ?? 0,
        estimatedBandwidth: 0,
        streamBandwidth: 0,
        bufferAhead,
        videoCodec: 'avc1.42001E',
        audioCodec: 'mp4a.40.2',
        itag: '18',
        mode: this.mode,
      };
    }
    const s = this.player.getStats();
    const active = this.player.getVariantTracks().find((t) => t.active);
    return {
      width: s.width,
      height: s.height,
      droppedFrames: s.droppedFrames,
      decodedFrames: s.decodedFrames,
      estimatedBandwidth: s.estimatedBandwidth,
      streamBandwidth: s.streamBandwidth,
      bufferAhead,
      videoCodec: active?.videoCodec || '',
      audioCodec: active?.audioCodec || '',
      itag: active?.originalVideoId ?? undefined,
      mode: this.mode,
    };
  }

  async destroy() {
    this.destroyed = true;
    try {
      await this.player?.destroy();
    } catch {
      /* ignore */
    }
    this.player = null;
  }
}
