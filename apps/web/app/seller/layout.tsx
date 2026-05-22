import type { ReactNode } from "react";
import { requireSessionRole } from "../../server/session";

export default async function SellerLayout({ children }: { children: ReactNode }) {
  await requireSessionRole("SELLER", "/seller/search");
  return children;
}
