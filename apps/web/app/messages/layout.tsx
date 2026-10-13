import type { ReactNode } from "react";
import "./messages.css";

export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <div className="messenger">{children}</div>;
}
