import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/invidious';
import { toCard, type CardVideo } from '../components/cards/model';
import { useLibrary } from '../stores/library';
import { usePlayerSession } from '../stores/player';
import { useSettings } from '../stores/settings';
import { Player } from './Player';

/** The single DOM node the player lives in; it is moved between the watch page and the miniplayer. */
const playerHostEl = document.createElement('div');
playerHostEl.className = 'player-host';
const parking = document.createElement('div');
parking.className = 'player-parking';
parking.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:360px;overflow:hidden;';
document.body.appendChild(parking);
parking.appendChild(playerHostEl);

/** Mount point for the persistent player. */
export function PlayerSlot({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.appendChild(playerHostEl);
    return () => {
      if (playerHostEl.parentElement === el) parking.appendChild(playerHostEl);
    };
  }, []);
  return <div ref={ref} className={className} />;
}

export function useVideoDetails(videoId: string | null) {
  return useQuery({
    queryKey: ['video', videoId],
    queryFn: () => api.video(videoId!),
    enabled: !!videoId,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

/** Computes next/previous for the current session (playlist order or "Up next" recommendation). */
export function useQueueNavigation() {
  const videoId = usePlayerSession((s) => s.videoId);
  const playlist = usePlayerSession((s) => s.playlist);
  const mini = usePlayerSession((s) => s.mini);
  const { data } = useVideoDetails(videoId);
  const notInterested = useLibrary((s) => s.notInterested);
  const navigate = useNavigate();

  const next: CardVideo | null = useMemo(() => {
    if (playlist) {
      const i = playlist.index + 1;
      if (i < playlist.videos.length) return toCard(playlist.videos[i]);
      if (playlist.loop && playlist.videos.length) return toCard(playlist.videos[0]);
      return null;
    }
    const recs = (data?.recommendedVideos || []).filter((v) => !notInterested.includes(v.videoId));
    return recs[0] ? toCard(recs[0]) : null;
  }, [playlist, data, notInterested]);

  const prev: CardVideo | null = useMemo(() => {
    if (playlist && playlist.index > 0) return toCard(playlist.videos[playlist.index - 1]);
    return null;
  }, [playlist]);

  const go = useCallback(
    (v: CardVideo, delta: number) => {
      const s = usePlayerSession.getState();
      if (s.playlist) {
        let idx = s.playlist.index + delta;
        if (idx >= s.playlist.videos.length) idx = 0;
        s.setPlaylist({ ...s.playlist, index: idx });
        if (s.mini) s.load(v.videoId);
        else navigate(`/watch?v=${v.videoId}&list=${s.playlist.id}&index=${idx + 1}`);
        return;
      }
      if (s.mini) s.load(v.videoId);
      else navigate(`/watch?v=${v.videoId}`);
    },
    [navigate],
  );

  return {
    next,
    prev,
    onNext: next ? () => go(next, 1) : undefined,
    onPrev: prev ? () => go(prev, -1) : undefined,
    mini,
  };
}

export function PlayerHost() {
  const videoId = usePlayerSession((s) => s.videoId);
  const startAt = usePlayerSession((s) => s.startAt);
  const mini = usePlayerSession((s) => s.mini);
  const playlist = usePlayerSession((s) => s.playlist);
  const setVideo = usePlayerSession((s) => s.setVideo);
  const theater = useSettings((s) => s.theater);
  const navigate = useNavigate();
  const { data, error: detailsError } = useVideoDetails(videoId);
  const { next, onNext, onPrev } = useQueueNavigation();

  useEffect(() => {
    setVideo(data && data.videoId === videoId ? data : null);
  }, [data, videoId, setVideo]);

  const endScreen = useMemo(() => (data?.recommendedVideos || []).slice(0, 12).map(toCard), [data]);

  const onToggleMini = useCallback(() => {
    const s = usePlayerSession.getState();
    if (s.mini) {
      navigate(`/watch?v=${s.videoId}${s.playlist ? `&list=${s.playlist.id}&index=${s.playlist.index + 1}` : ''}`);
    } else {
      if (window.history.length > 1) navigate(-1);
      else navigate('/');
    }
  }, [navigate]);

  if (!videoId) return null;
  return createPortal(
    <Player
      videoId={videoId}
      video={data && data.videoId === videoId ? data : null}
      startAt={startAt}
      mini={mini}
      theater={theater}
      onToggleTheater={() => useSettings.getState().set({ theater: !useSettings.getState().theater })}
      onToggleMini={onToggleMini}
      next={next}
      onNext={onNext}
      onPrev={onPrev}
      endScreen={endScreen}
      inPlaylist={!!playlist}
      detailsError={detailsError ? (detailsError as Error).message : null}
      onChapterClick={() => document.getElementById('description-chapters')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
    />,
    playerHostEl,
  );
}
