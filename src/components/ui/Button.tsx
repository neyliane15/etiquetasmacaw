import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'warning';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, block = false, type = 'button', className, disabled, children, ...rest },
  ref,
) {
  const cls = [
    'ui-btn',
    `ui-btn-${variant}`,
    size === 'sm' ? 'ui-btn-sm' : '',
    block ? 'ui-btn-block' : '',
    loading ? 'ui-btn-loading' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={size === 'sm' ? 11 : 13} /> : icon ? <span className="ui-btn-icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
});
