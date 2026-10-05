import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Modal({ onClose, children, className, width }: { onClose: () => void; children: ReactNode; className?: string; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (className ? ' ' + className : '')} style={{ width }} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} width={400}>
      <div style={{ padding: '24px 24px 8px', fontSize: 14, lineHeight: '20px' }}>{message}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '8px 12px 12px' }}>
        <button className="pill-btn text" onClick={onClose}>
          Cancel
        </button>
        <button
          className="pill-btn cta-text"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
