import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps): JSX.Element {
  return (
    <div className="ui-empty">
      <div className="ui-empty-icon" aria-hidden="true">
        {icon ?? (
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="3" y="2.5" width="12" height="13" rx="1.5" />
            <path d="M6 6.5h6M6 9h6M6 11.5h3.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="ui-empty-title">{title}</div>
      {description && <div className="ui-empty-desc">{description}</div>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
