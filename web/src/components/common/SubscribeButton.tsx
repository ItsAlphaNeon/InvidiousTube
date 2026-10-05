import { useRef, useState } from 'react';
import { useIsSubscribed, useSubscribeActions } from '../../hooks/useAccount';
import { Icon } from '../../icons';
import { useAuth } from '../../stores/auth';
import { useLibrary } from '../../stores/library';
import { ConfirmDialog } from './Modal';
import { Menu, MenuItem } from './Menu';

interface Props {
  authorId: string;
  author: string;
  thumbnail?: string;
  size?: 'default' | 'sm';
}

export function SubscribeButton({ authorId, author, thumbnail, size = 'default' }: Props) {
  const subscribed = useIsSubscribed(authorId);
  const { subscribe, unsubscribe } = useSubscribeActions();
  const loggedIn = useAuth((s) => s.loggedIn);
  const notify = useLibrary((s) => s.subscriptions.find((x) => x.authorId === authorId)?.notify ?? 'personalized');
  const setNotify = useLibrary((s) => s.setNotify);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const sub = { authorId, author, thumbnail };
  const cls = 'pill-btn' + (size === 'sm' ? ' sm' : '');

  if (!subscribed) {
    return (
      <button className={cls + ' filled subscribe-btn'} onClick={() => subscribe(sub)}>
        Subscribe
      </button>
    );
  }

  const bellIcon = notify === 'all' ? 'bellFilled' : notify === 'none' ? 'bellOff' : 'bell';
  return (
    <>
      <button ref={btnRef} className={cls + ' icon-leading subscribed-btn'} onClick={() => setMenuOpen((o) => !o)}>
        <Icon name={bellIcon} />
        Subscribed
        <Icon name="chevronDown" />
      </button>
      <Menu anchor={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)} align="left">
        {!loggedIn && (
          <>
            <MenuItem icon="bellFilled" onClick={() => (setNotify(authorId, 'all'), setMenuOpen(false))}>
              All
            </MenuItem>
            <MenuItem icon="bell" onClick={() => (setNotify(authorId, 'personalized'), setMenuOpen(false))}>
              Personalized
            </MenuItem>
            <MenuItem icon="bellOff" onClick={() => (setNotify(authorId, 'none'), setMenuOpen(false))}>
              None
            </MenuItem>
          </>
        )}
        <MenuItem
          icon="person"
          onClick={() => {
            setMenuOpen(false);
            setConfirm(true);
          }}
        >
          Unsubscribe
        </MenuItem>
      </Menu>
      {confirm && (
        <ConfirmDialog
          message={`Unsubscribe from ${author}?`}
          confirmLabel="Unsubscribe"
          onConfirm={() => unsubscribe(sub)}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  );
}
