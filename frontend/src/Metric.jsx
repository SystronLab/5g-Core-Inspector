import React from "react";
export default function Metric({
  icon: Icon,
  label,
  value,
  note,
  tone = "neutral",
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <div>
        <div className="metric-value">{value}</div>
        <div className="metric-label">{label}</div>
        {note ? <div className="metric-note">{note}</div> : null}
      </div>
    </div>
  );
}
