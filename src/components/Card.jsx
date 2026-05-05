export default function Card({ step, title, children }) {
  return (
    <div className="card">
      {(step != null || title) && (
        <div className="card-header">
          {step != null && <span className="card-step">{step}</span>}
          {title && <span className="card-title">{title}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
