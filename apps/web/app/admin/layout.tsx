import type { ReactNode } from "react";
import { requireSessionRole } from "../../server/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireSessionRole("ADMIN", "/admin");
  return children;
}
