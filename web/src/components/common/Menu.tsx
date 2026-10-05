import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/useClickOutside';
import { Icon, type IconName } from '../../icons';
import { useIsMobile } from '../../mobile/useIsMobile';
import { Sheet } from '../../mobile/Sheet';

interface MenuProps {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
  /** gap between anchor and popup */
  offset?: number;
  minWidth?: number;
  className?: string;
  /** position the menu over the anchor rather than below it */
  cover?: boolean;
}

export function Menu({ anchor, open, onClose, children, align = 'right', offset = 4, minWidth, className, cover }: MenuProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const mobile = useIsMobile();

  useLayoutEffect(() => {
    if (!open || mobile) {
      setPos(null);
      return;
    }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = popRef.current;
      if (!a || !p) return;
      const pw = p.offsetWidth;
      const ph = p.offsetHeight;
      let left = align === 'right' ? a.right - pw : a.left;
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      let top = cover ? a.top : a.bottom + offset;
      if (top + ph > window.innerHeight - 8) {
        const above = (cover ? a.bottom : a.top - offset) - ph;
        top = above >= 8 ? above : Math.max(8, window.innerHeight - ph - 8);
      }
      setPos({ top, left });
    };
    place();
    const ro = new ResizeObserver(place);
    if (popRef.current) ro.observe(popRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onClose, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onClose);
    };
  }, [open, anchor, align, offset, cover, onClose, mobile]);

  useClickOutside([popRef, anchor], onClose, open && !mobile);

  if (!open) return null;
  // Phones get the app's bottom sheet instead of a popup
  if (mobile) {
    return (
      <Sheet onClose={onClose} className="m-menu-sheet">
        <div role="menu">{children}</div>
      </Sheet>
    );
  }
  return createPortal(
    <div
      ref={popRef}
      className={'menu-popup' + (className ? ' ' + className : '')}
      role="menu"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, minWidth, visibility: pos ? 'visible' : 'hidden' }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      onWheel={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

interface ItemProps {
  icon?: IconName;
  children: ReactNode;
  onClick?: () => void;
  trailing?: ReactNode;
  checked?: boolean;
}

export function MenuItem({ icon, children, onClick, trailing, checked }: ItemProps) {
  return (
    <button className="menu-item" role="menuitem" onClick={onClick}>
      {checked !== undefined && (
        <span style={{ width: 24, display: 'inline-flex' }}>{checked && <Icon name="checkThin" />}</span>
      )}
      {icon && <Icon name={icon} />}
      <span style={{ flex: 1 }}>{children}</span>
      {trailing}
    </button>
  );
}

export function MenuDivider() {
  return <div className="menu-divider" />;
}
