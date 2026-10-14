"use client";

interface Option {
  value: string;
  label: React.ReactNode;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  /** Permite que los botones salten de línea si no caben (p. ej. en modales estrechos). */
  wrap?: boolean;
}

export default function Segmented({ value, onChange, options, wrap }: Props) {
  return (
    <div className={wrap ? "segmented wrap" : "segmented"} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
