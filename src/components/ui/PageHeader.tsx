import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** rota */
  back?: string;
}

export function PageHeader({ title, subtitle, actions, back }: PageHeaderProps): JSX.Element {
  useEffect(() => {
    document.title = `${title} · Etiquetas Macaw`;
  }, [title]);

  return (
    <header className="ui-page-header">
      <div className="ui-page-header-text">
        {back && (
          <Link to={back} className="ui-page-header-back">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M6.5 1.5L3 5l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            Voltar
          </Link>
        )}
        <h1 className="ui-page-title">{title}</h1>
        {subtitle && <div className="ui-page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </header>
  );
}
