import type { CSSProperties, ReactNode } from 'react';

export interface FormRowProps {
  children: ReactNode;
  cols?: 1 | 2 | 3 | 4;
}

export function FormRow({ children, cols = 2 }: FormRowProps): JSX.Element {
  return (
    <div className="ui-form-row" data-cols={cols} style={{ '--cols': cols } as CSSProperties}>
      {children}
    </div>
  );
}
