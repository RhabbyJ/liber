import type { ReactNode } from "react";
import { requireSessionRole } from "../../server/session";

export default async function BuyerLayout({ children }: { children: ReactNode }) {
  await requireSessionRole("BUYER", "/buyer/profile");
  return children;
}
