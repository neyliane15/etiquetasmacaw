import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  suffix?: ReactNode;
}

interface FieldShellProps {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function FieldShell({ id, label, hint, error, required, className, children }: FieldShellProps): JSX.Element {
  return (
    <div className={['ui-field', error ? 'ui-field-error' : '', className ?? ''].filter(Boolean).join(' ')}>
      {label && (
        <label className="ui-label" htmlFor={id}>
          {label}
          {required && <span className="req" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="ui-error" id={`${id}-err`} role="alert">{error}</span>
      ) : hint ? (
        <span className="ui-hint" id={`${id}-hint`}>{hint}</span>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-err`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, suffix, id, className, required, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} required={required} className={className}>
      <div className={['ui-control', suffix ? 'ui-has-suffix' : ''].filter(Boolean).join(' ')}>
        <input
          ref={ref}
          id={inputId}
          className="ui-input"
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, error, hint)}
          {...rest}
        />
        {suffix && <span className="ui-suffix">{suffix}</span>}
      </div>
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, className, required, rows = 3, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        ref={ref}
        id={inputId}
        className="ui-textarea"
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label className={['ui-checkbox', className ?? ''].filter(Boolean).join(' ')} htmlFor={inputId}>
      <input ref={ref} id={inputId} type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
});
