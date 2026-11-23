import type { ReactNode } from 'react';
import { Button } from './Button';
import { Spinner } from './Spinner';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  compact?: boolean;
}

function alignClass(a?: Column<unknown>['align']): string {
  return a === 'center' ? 'al-center' : a === 'right' ? 'al-right' : '';
}

export function Table<T>({ columns, rows, rowKey, loading = false, empty, onRowClick, compact = false }: TableProps<T>): JSX.Element {
  const cls = ['ui-table', compact ? 'ui-table-compact' : '', onRowClick ? 'ui-table-clickable' : ''].filter(Boolean).join(' ');
  return (
    <div className="ui-table-wrap">
      <table className={cls}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width !== undefined ? { width: c.width } : undefined} className={[alignClass(c.align), c.className ?? ''].filter(Boolean).join(' ') || undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <tr className="ui-table-loading">
              <td colSpan={columns.length}>
                <div className="ui-spinner-page" style={{ padding: 0 }}><Spinner label="Carregando…" /></div>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr className="ui-table-empty">
              <td colSpan={columns.length}>{empty ?? 'Nenhum registro encontrado.'}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter') onRowClick(row);
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td key={c.key} className={[alignClass(c.align), c.className ?? ''].filter(Boolean).join(' ') || undefined}>
                    {c.render ? c.render(row) : formatCell((row as Record<string, unknown>)[c.key])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown): string {
  return String(v ?? '—');
}

export interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange(offset: number): void;
}

export function Pagination({ total, limit, offset, onChange }: PaginationProps): JSX.Element {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  const page = Math.min(pages, Math.floor(offset / Math.max(1, limit)) + 1);
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(total, offset + limit);
  return (
    <nav className="ui-pagination" aria-label="Paginação">
      <span>
        {from}–{to} de {total}
      </span>
      <div className="ui-pagination-pages">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}>
          Anterior
        </Button>
        <span>
          {page} / {pages}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(offset + limit)}>
          Próxima
        </Button>
      </div>
    </nav>
  );
}
