import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div>
      <span className="summary-label">{label}</span>
      <span className="summary-value">{value}</span>
      {hint ? <span className="muted small">{hint}</span> : null}
    </div>
  );
}
