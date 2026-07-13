import { Icon } from "./icon";

export type QuietStateVisualName = "access" | "invites" | "notifications" | "properties" | "search";

const visualIcon = {
  access: "lock",
  invites: "mail",
  notifications: "bell",
  properties: "home",
  search: "search",
} as const;

export function QuietStateVisual({ compact = false, name }: { compact?: boolean; name: QuietStateVisualName }) {
  return (
    <div aria-hidden="true" className={`quiet-state-visual ${name}${compact ? " compact" : ""}`}>
      <span className="quiet-contour contour-a" />
      <span className="quiet-contour contour-b" />
      <span className="quiet-parcel parcel-a" />
      <span className="quiet-parcel parcel-b" />
      <span className="quiet-signal signal-a"><i /></span>
      <span className="quiet-signal signal-b"><i /></span>
      <span className="quiet-state-object">
        <Icon name={visualIcon[name]} size={compact ? 18 : 24} />
      </span>
    </div>
  );
}
