import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  onClose(): void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const FOCUSABLE = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const node = ref.current;
    if (node) {
      const body = node.querySelector<HTMLElement>('.ui-modal-body');
      const first = body?.querySelector<HTMLElement>(FOCUSABLE) ?? node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="ui-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className={`ui-modal ui-modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="ui-modal-head">
          <h2 className="ui-modal-title" id={titleId}>{title}</h2>
          <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', variant = 'primary', loading = false, onConfirm, onCancel }: ConfirmDialogProps): JSX.Element | null {
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancelar</Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div style={{ fontSize: 'var(--fs-base)' }}>{message}</div>
    </Modal>
  );
}
