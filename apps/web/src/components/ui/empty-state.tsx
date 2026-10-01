interface Props {
  title?: string;
  message?: React.ReactNode;
  action?: React.ReactNode;
}

export default function EmptyState({ title = "Sin datos todavía", message, action }: Props) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      {message && <p style={{ margin: "0 0 12px" }}>{message}</p>}
      {action}
    </div>
  );
}
