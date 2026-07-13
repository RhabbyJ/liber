import type { ReactNode } from "react";
import { Icon } from "./icon";
import { QuietStateVisual, type QuietStateVisualName } from "./quiet-state-visual";

type IconName = "search" | "people" | "mail" | "doc" | "shield" | "tag" | "home" | "sparkle";

export function EmptyState({
  icon = "sparkle",
  title,
  description,
  actions,
  visual,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  actions?: ReactNode;
  visual?: QuietStateVisualName;
}) {
  return (
    <div className="empty-state">
      {visual ? (
        <QuietStateVisual name={visual} />
      ) : (
        <span className="empty-icon">
          <Icon name={icon} size={22} />
        </span>
      )}
      <h3>{title}</h3>
      {description ? <p className="muted">{description}</p> : null}
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
