export default function HelpNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="help-note">
      <span className="help-icon">i</span>
      <div>{children}</div>
    </div>
  );
}
