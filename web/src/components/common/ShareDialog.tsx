import { useMemo, useState } from 'react';
import { formatDuration } from '../../api/format';
import { Icon } from '../../icons';
import { toast } from '../../stores/ui';
import { Modal } from './Modal';
import './dialogs.css';

interface Props {
  videoId?: string;
  playlistId?: string;
  title: string;
  currentTime?: number;
  onClose: () => void;
}

const TARGETS = [
  { id: 'reddit', label: 'Reddit', color: '#ff4500', url: (u: string, t: string) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}` },
  { id: 'x', label: 'X', color: '#000', url: (u: string, t: string) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { id: 'facebook', label: 'Facebook', color: '#1877f2', url: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25d366', url: (u: string) => `https://api.whatsapp.com/send?text=${encodeURIComponent(u)}` },
  { id: 'email', label: 'Email', color: '#888', url: (u: string, t: string) => `mailto:?subject=${encodeURIComponent(t)}&body=${encodeURIComponent(u)}` },
];

export function ShareDialog({ videoId, playlistId, title, currentTime = 0, onClose }: Props) {
  const [startAt, setStartAt] = useState(false);
  const [useInstance, setUseInstance] = useState(false);
  const t = Math.floor(currentTime);
  const url = useMemo(() => {
    if (useInstance) {
      const base = location.origin;
      if (videoId) return `${base}/watch?v=${videoId}${playlistId ? `&list=${playlistId}` : ''}${startAt && t ? `&t=${t}` : ''}`;
      return `${base}/playlist?list=${playlistId}`;
    }
    if (videoId) return `https://youtu.be/${videoId}${startAt && t ? `?t=${t}` : ''}`;
    return `https://www.youtube.com/playlist?list=${playlistId}`;
  }, [useInstance, videoId, playlistId, startAt, t]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Link copied to clipboard');
  };

  return (
    <Modal onClose={onClose} className="share-dialog">
      <div className="share-header">
        <span>Share</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="share-targets">
        {TARGETS.map((s) => (
          <a key={s.id} className="share-target" href={s.url(url, title)} target="_blank" rel="noreferrer">
            <span className="share-target-icon" style={{ background: s.color }}>
              {s.label.charAt(0)}
            </span>
            <span>{s.label}</span>
          </a>
        ))}
      </div>
      <div className="share-url">
        <input readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="pill-btn blue" onClick={copy}>
          Copy
        </button>
      </div>
      <div className="share-options">
        {videoId && (
          <label className="share-option">
            <input type="checkbox" checked={startAt} onChange={(e) => setStartAt(e.target.checked)} />
            Start at {formatDuration(t)}
          </label>
        )}
        <label className="share-option">
          <input type="checkbox" checked={useInstance} onChange={(e) => setUseInstance(e.target.checked)} />
          Link to this instance
        </label>
      </div>
    </Modal>
  );
}
