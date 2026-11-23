import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  actions?: ReactNode;
  /** default true: filete oliva no topo + linha dupla creme sob o título */
  accent?: boolean;
  padding?: 'none' | 'sm' | 'md';
}

export function Card({ title, actions, accent = true, padding = 'md', className, children, ...rest }: CardProps): JSX.Element {
  const cls = ['ui-card', accent ? 'ui-card-accent' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <section className={cls} {...rest}>
      {(title || actions) && (
        <header className="ui-card-head">
          <h2 className="ui-card-title">{title}</h2>
          {actions && <div className="ui-card-actions">{actions}</div>}
        </header>
      )}
      <div className={`ui-card-body-${padding}`}>{children}</div>
    </section>
  );
}

export type StatTone = 'olive' | 'danger' | 'warning' | 'success' | 'neutral';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  /** link */
  to?: string;
}

export function StatCard({ label, value, hint, tone = 'olive', to }: StatCardProps): JSX.Element {
  const content = (
    <>
      <span className="ui-stat-label">{label}</span>
      <span className="ui-stat-value">{value}</span>
      {hint && <span className="ui-stat-hint">{hint}</span>}
    </>
  );
  const cls = `ui-stat ui-stat-${tone}`;
  return to ? (
    <Link to={to} className={cls}>{content}</Link>
  ) : (
    <div className={cls}>{content}</div>
  );
}
