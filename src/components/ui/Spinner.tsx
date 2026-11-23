export interface SpinnerProps {
  size?: number;
  label?: string;
}

export function Spinner({ size = 16, label }: SpinnerProps): JSX.Element {
  return (
    <span className="ui-spinner" role="status" aria-live="polite">
      <span className="ui-spinner-ring" style={{ width: size, height: size }} aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="sr-only">Carregando…</span>}
    </span>
  );
}
