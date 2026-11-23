import type { ReactNode } from 'react';

export interface TabsProps {
  tabs: { id: string; label: ReactNode }[];
  active: string;
  onChange(id: string): void;
}

export function Tabs({ tabs, active, onChange }: TabsProps): JSX.Element {
  return (
    <div className="ui-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          className="ui-tab"
          aria-selected={t.id === active}
          tabIndex={t.id === active ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
