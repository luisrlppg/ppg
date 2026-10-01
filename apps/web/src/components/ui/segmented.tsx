"use client";

interface Option {
  value: string;
  label: React.ReactNode;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
}

export default function Segmented({ value, onChange, options }: Props) {
  return (
    <div className="segmented" role="tablist">
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
