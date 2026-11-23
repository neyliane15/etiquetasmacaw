import type { ReactNode } from 'react';
import type { BadgeVariant } from '@/types/database';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  title?: string;
  dot?: boolean;
}

export function Badge({ variant = 'neutral', children, title, dot = false }: BadgeProps): JSX.Element {
  return (
    <span className={['ui-badge', `ui-badge-${variant}`, dot ? 'ui-badge-dot' : ''].filter(Boolean).join(' ')} title={title}>
      {children}
    </span>
  );
}
