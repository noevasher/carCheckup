import { type KeyboardEvent, useId, useState } from 'react';
import { cx } from '../../design/cx';

export interface CatalogValue {
  /** Catalog id, or null for free text (FR-002). */
  id: string | null;
  name: string;
}

interface AutocompleteProps {
  label: string;
  placeholder?: string;
  value: CatalogValue;
  onChange: (value: CatalogValue) => void;
  options: readonly { id: string; name: string }[];
  loading?: boolean;
  error?: string | undefined;
  hint?: string | undefined;
  disabled?: boolean;
}

/** Accessible combobox: suggestions while typing; free text is always accepted. */
export function Autocomplete({
  label,
  placeholder,
  value,
  onChange,
  options,
  loading = false,
  error,
  hint,
  disabled = false,
}: AutocompleteProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const visible = open && options.length > 0 && !disabled;

  function select(option: { id: string; name: string }) {
    onChange({ id: option.id, name: option.name });
    setOpen(false);
    setHighlight(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter' && visible && highlight >= 0) {
      const option = options[highlight];
      if (option !== undefined) {
        event.preventDefault();
        select(option);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const describedBy = [hint !== undefined && `${id}-hint`, error !== undefined && `${id}-error`]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listId}
        aria-activedescendant={visible && highlight >= 0 ? `${id}-opt-${String(highlight)}` : undefined}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy || undefined}
        autoComplete="off"
        autoCapitalize="words"
        disabled={disabled}
        placeholder={placeholder}
        value={value.name}
        onChange={(e) => {
          onChange({ id: null, name: e.target.value });
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          // Delay so a tap on an option registers before the list closes.
          setTimeout(() => {
            setOpen(false);
          }, 150);
        }}
        onKeyDown={onKeyDown}
        className={cx(
          'min-h-tap w-full rounded-xl border bg-surface px-3.5 py-2.5 text-base text-text placeholder:text-text-muted',
          'disabled:opacity-60',
          error !== undefined ? 'border-danger' : 'border-border',
        )}
      />
      {loading && open && <span className="sr-only">Buscando sugerencias</span>}
      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!visible}
        className="absolute top-full z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg"
      >
        {options.map((option, index) => (
          <li
            key={option.id}
            id={`${id}-opt-${String(index)}`}
            role="option"
            aria-selected={option.id === value.id}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              select(option);
            }}
            className={cx(
              'flex min-h-tap cursor-pointer items-center px-3.5',
              index === highlight && 'bg-surface-muted',
              option.id === value.id && 'font-semibold text-primary',
            )}
          >
            {option.name}
          </li>
        ))}
      </ul>
      {hint !== undefined && (
        <p id={`${id}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
