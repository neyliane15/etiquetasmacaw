import { forwardRef, useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { FieldShell } from './Input';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, id, className, required, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <FieldShell id={selectId} label={label} hint={hint} error={error} required={required} className={className}>
      <select
        ref={ref}
        id={selectId}
        className="ui-select"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-err` : hint ? `${selectId}-hint` : undefined}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});
