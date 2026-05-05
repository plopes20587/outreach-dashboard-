export default function Field({ label, badge, children }) {
  return (
    <div className="field">
      {label && (
        <span className="field-label">
          {label}
          {badge}
        </span>
      )}
      {children}
    </div>
  );
}
