export default function FitBar({ score }) {
  const color =
    score >= 75 ? "var(--green)" :
    score >= 50 ? "var(--amber)" :
    "var(--red)";

  return (
    <div className="fit-bar-row">
      <span className="fit-score">{score}/100</span>
      <div className="fit-bar-track">
        <div
          className="fit-bar-fill"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
}
