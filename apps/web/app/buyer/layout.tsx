import type { ReactNode } from "react";
import { requireSessionRole } from "../../server/session";
import "./buyer.css";

export default async function BuyerLayout({ children }: { children: ReactNode }) {
  await requireSessionRole("BUYER", "/buyer/profile");
  return children;
}
