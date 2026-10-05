import { useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../icons';
import { useLibrary } from '../../stores/library';
import { toast } from '../../stores/ui';
import { Menu, MenuDivider, MenuItem } from '../common/Menu';
import { SaveDialog } from '../common/SaveDialog';
import { ShareDialog } from '../common/ShareDialog';
import { toLiteFromCard, type CardVideo } from './model';

interface Props {
  video: CardVideo;
  extra?: (close: () => void) => ReactNode;
  className?: string;
  onNotInterested?: () => void;
}

/** The ⋮ action menu shown on every video card. */
export function VideoMenu({ video, extra, className, onNotInterested }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'save' | 'share' | null>(null);
  const toggleWL = useLibrary((s) => s.toggleWatchLater);
  const inWL = useLibrary((s) => s.watchLater.some((v) => v.videoId === video.videoId));
  const markNotInterested = useLibrary((s) => s.markNotInterested);
  const close = () => setOpen(false);
  return (
    <>
      <button
        ref={ref}
        className={'icon-btn card-menu-btn' + (className ? ' ' + className : '') + (open ? ' open' : '')}
        aria-label="Action menu"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Icon name="moreVert" />
      </button>
      <Menu anchor={ref} open={open} onClose={close} minWidth={250}>
        <MenuItem
          icon="watchLater"
          onClick={() => {
            close();
            const added = toggleWL(toLiteFromCard(video));
            toast(added ? 'Saved to Watch later' : 'Removed from Watch later');
          }}
        >
          {inWL ? 'Remove from Watch later' : 'Save to Watch later'}
        </MenuItem>
        <MenuItem icon="save" onClick={() => (close(), setDialog('save'))}>
          Save to playlist
        </MenuItem>
        <MenuItem icon="download" onClick={() => (close(), window.open(`/companion/latest_version?id=${video.videoId}&itag=18&local=true`, '_blank'))}>
          Download
        </MenuItem>
        <MenuItem icon="share" onClick={() => (close(), setDialog('share'))}>
          Share
        </MenuItem>
        {extra?.(close)}
        <MenuDivider />
        <MenuItem
          icon="notInterested"
          onClick={() => {
            close();
            markNotInterested(video.videoId);
            onNotInterested?.();
            toast('Video removed', { action: { label: 'Undo', onClick: () => useLibrary.setState((s) => ({ notInterested: s.notInterested.filter((x) => x !== video.videoId) })) } });
          }}
        >
          Not interested
        </MenuItem>
      </Menu>
      {dialog === 'save' && <SaveDialog video={toLiteFromCard(video)} onClose={() => setDialog(null)} />}
      {dialog === 'share' && <ShareDialog videoId={video.videoId} title={video.title} onClose={() => setDialog(null)} />}
    </>
  );
}
