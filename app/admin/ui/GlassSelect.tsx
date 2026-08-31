"use client";

import { useEffect, useId, useState } from "react";

export type GlassSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export default function GlassSelect({
  name,
  options,
  defaultValue = "",
  value: controlledValue,
  onValueChange,
  placeholder = "Pilih opsi",
  required = false,
  disabled = false,
  emptyMessage = "Tidak ada opsi tersedia.",
}: {
  name: string;
  options: GlassSelectOption[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const descriptionId = useId();
  const value = controlledValue ?? internalValue;
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (controlledValue === undefined) setInternalValue(defaultValue);
  }, [controlledValue, defaultValue]);

  return (
    <div className="r9-select-field">
      <div className="r9-select-control">
        <select
          name={name}
          value={value}
          required={required}
          disabled={disabled || options.length === 0}
          aria-describedby={selected?.description ? descriptionId : undefined}
          className="r9-select"
          onChange={(event) => {
            const nextValue = event.target.value;
            if (controlledValue === undefined) setInternalValue(nextValue);
            onValueChange?.(nextValue);
          }}
        >
          <option value="" disabled={required}>
            {options.length === 0 ? emptyMessage : placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="r9-select-chevron" aria-hidden="true">⌄</span>
      </div>

      {selected?.description ? (
        <p id={descriptionId} className="r9-select-description">
          {selected.description}
        </p>
      ) : null}
    </div>
  );
}
