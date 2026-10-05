import { useState } from 'react';
import { useMyPlaylists, usePlaylistActions } from '../../hooks/useAccount';
import { Icon } from '../../icons';
import { useLibrary, type VideoLite } from '../../stores/library';
import { toast } from '../../stores/ui';
import { Modal } from './Modal';
import './dialogs.css';

export function SaveDialog({ video, onClose }: { video: VideoLite; onClose: () => void }) {
  const { playlists } = useMyPlaylists();
  const actions = usePlaylistActions();
  const inWL = useLibrary((s) => s.watchLater.some((v) => v.videoId === video.videoId));
  const toggleWL = useLibrary((s) => s.toggleWatchLater);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('private');
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} className="save-dialog">
      <div className="save-header">
        <span>Save video to...</span>
        <button className="icon-btn" onClick={onClose} aria-label="Cancel">
          <Icon name="close" />
        </button>
      </div>
      <div className="save-list">
        <label className="save-row">
          <input
            type="checkbox"
            checked={inWL}
            onChange={() => {
              const added = toggleWL(video);
              toast(added ? 'Saved to Watch later' : 'Removed from Watch later');
            }}
          />
          <span className="save-check" />
          <span className="save-name">Watch later</span>
          <Icon name="lock" size={20} />
        </label>
        {playlists.map((p) => {
          const checked = p.videoIds.includes(video.videoId);
          return (
            <label className="save-row" key={p.id}>
              <input
                type="checkbox"
                checked={checked}
                disabled={busy === p.id}
                onChange={async () => {
                  setBusy(p.id);
                  try {
                    const added = await actions.toggle(p, video);
                    toast(added ? `Saved to ${p.title}` : `Removed from ${p.title}`);
                  } catch {
                    toast('Could not update playlist');
                  } finally {
                    setBusy(null);
                  }
                }}
              />
              <span className="save-check" />
              <span className="save-name">{p.title}</span>
              <Icon name={p.privacy === 'public' ? 'globe' : p.privacy === 'unlisted' ? 'link' : 'lock'} size={20} />
            </label>
          );
        })}
      </div>
      {!creating ? (
        <button className="save-create" onClick={() => setCreating(true)}>
          <Icon name="add" />
          Create new playlist
        </button>
      ) : (
        <form
          className="save-new"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            try {
              await actions.create(name.trim(), privacy, video);
              toast(`Saved to ${name.trim()}`);
              onClose();
            } catch {
              toast('Could not create playlist');
            }
          }}
        >
          <label className="save-field">
            <span>Name</span>
            <input autoFocus maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter playlist name..." />
          </label>
          <label className="save-field">
            <span>Privacy</span>
            <select value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)}>
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="pill-btn cta-text" type="submit" disabled={!name.trim()}>
              Create
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
