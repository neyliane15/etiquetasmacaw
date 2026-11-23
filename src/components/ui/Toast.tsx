import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  msg: string;
}

export interface ToastApi {
  success(msg: string): void;
  error(msg: string | unknown): void;
  info(msg: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

function mensagemErro(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return 'Ocorreu um erro inesperado.';
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, msg: string) => {
      const id = ++seq.current;
      setItems((list) => [...list.slice(-3), { id, kind, msg }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (msg) => push('success', msg),
      error: (msg) => push('error', mensagemErro(msg)),
      info: (msg) => push('info', msg),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toasts" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={`ui-toast ui-toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className="ui-toast-msg">{t.msg}</span>
            <button type="button" className="ui-toast-close" onClick={() => dismiss(t.id)} aria-label="Fechar aviso">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const noop: ToastApi = {
  success: () => undefined,
  error: (e) => console.error(e),
  info: () => undefined,
};

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? noop;
}
