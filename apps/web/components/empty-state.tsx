import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export function EmptyState({
  icon = "sparkle",
  title,
  description,
  actions,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      {description ? <p className="muted">{description}</p> : null}
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
