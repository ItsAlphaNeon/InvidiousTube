import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../icons';

interface SheetProps {
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  /** extra controls next to the close button (panel sheets) */
  actions?: ReactNode;
  className?: string;
  /**
   * modal: bottom sheet over a scrim (menus, pickers).
   * panel: fills its positioned parent, used on the watch page under the player (comments, description).
   */
  variant?: 'modal' | 'panel';
  /** where to portal a modal sheet (defaults to <body>; the player passes itself when fullscreen) */
  container?: Element | null;
}

/** App-style bottom sheet that can be dragged down to dismiss. */
export function Sheet({ onClose, children, title, actions, className, variant = 'modal', container }: SheetProps) {
  const [dy, setDy] = useState(0);
  const [closing, setClosing] = useState(false);
  const start = useRef<{ y: number; id: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    if (variant === 'modal') document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      if (variant === 'modal') document.body.classList.remove('no-scroll');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag down from the handle/header (or from the content when it's scrolled to the top)
  const dragProps = (fromContent: boolean) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && fromContent) return;
      if (fromContent && (bodyRef.current?.scrollTop ?? 0) > 0) return;
      start.current = { y: e.clientY, id: e.pointerId };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const d = e.clientY - s.y;
      if (fromContent && d < 0) {
        start.current = null;
        return;
      }
      setDy(Math.max(0, d));
    },
    onPointerUp: () => {
      if (!start.current) return;
      start.current = null;
      if (dy > 90) close();
      else setDy(0);
    },
    onPointerCancel: () => {
      start.current = null;
      setDy(0);
    },
  });

  const panelStyle = dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined;
  const cls = `m-sheet m-sheet-${variant}` + (closing ? ' closing' : '') + (className ? ' ' + className : '');

  if (variant === 'panel') {
    return (
      <div className={cls} style={panelStyle}>
        <div className="m-sheet-header" {...dragProps(false)}>
          <div className="m-sheet-handle" />
          <div className="m-sheet-title">{title}</div>
          {actions}
          <button className="m-icon-btn" onClick={close} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="m-sheet-body" ref={bodyRef}>
          {children}
        </div>
      </div>
    );
  }

  return createPortal(
    <div className={'m-sheet-scrim' + (closing ? ' closing' : '')} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className={cls} style={panelStyle} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-grip" {...dragProps(false)}>
          <div className="m-sheet-handle" />
        </div>
        {title && <div className="m-sheet-modal-title">{title}</div>}
        <div className="m-sheet-body" ref={bodyRef} {...dragProps(true)}>
          {children}
        </div>
      </div>
    </div>,
    container || document.body,
  );
}
