import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface Props {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumb?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, breadcrumb, actions }: Props) {
  return (
    <>
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="breadcrumb">
          {breadcrumb.map((b, i) => (
            <span key={`${b.label}-${i}`}>
              {i > 0 && <span className="sep">/</span>}
              {b.href ? <Link href={b.href}>{b.label}</Link> : b.label}
            </span>
          ))}
        </div>
      )}
      <div className="page-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </>
  );
}
