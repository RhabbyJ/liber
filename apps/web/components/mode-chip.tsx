import { Icon } from "./icon";

type Mode = "buyer" | "seller" | "admin";

const modeLabel: Record<Mode, string> = {
  admin: "Admin",
  buyer: "Buyer mode",
  seller: "Seller mode",
};

export function ModeChip({ mode, label }: { mode: Mode; label?: string }) {
  return (
    <span className={`mode-chip ${mode}`}>
      <Icon name={mode === "admin" ? "shield" : mode === "seller" ? "search" : "user"} size={12} />
      {label || modeLabel[mode]}
    </span>
  );
}
