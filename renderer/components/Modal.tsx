import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  width?: 'normal' | 'wide';
}

export function Modal({ open, title, onClose, children, width = 'normal' }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-shell ${width === 'wide' ? 'modal-shell-wide' : ''}`} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            {title ? <h2>{title}</h2> : null}
          </div>
          <button className="icon-button subtle-button" type="button" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
