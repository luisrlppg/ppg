type Variant = "normal" | "bajo" | "critico" | "info" | "";

export default function Badge({ variant = "", children }: { variant?: Variant; children: React.ReactNode }) {
  return <span className={variant ? `badge ${variant}` : "badge"}>{children}</span>;
}
