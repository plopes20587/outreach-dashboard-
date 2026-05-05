export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn${active === tab.id ? " active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
