import type { AppRole } from "../server/authz";

export type NavItem = {
  href: string;
  isActive: (pathname: string) => boolean;
  label: string;
  mode?: "buyer" | "seller" | "admin";
};

const demandMapItem: NavItem = {
  href: "/",
  label: "Demand map",
  isActive: (pathname) => pathname === "/",
};

const guestItems: NavItem[] = [
  {
    href: "/signup?role=buyer&next=%2Fbuyer%2Fprofile",
    label: "For buyers",
    isActive: () => false,
  },
  {
    href: "/signup?role=seller&next=%2Fseller%2Fsearch",
    label: "For sellers",
    isActive: () => false,
  },
];

const buyerItems: NavItem[] = [
  {
    href: "/buyer/invites",
    label: "Received invites",
    isActive: (pathname) => pathname === "/buyer/invites" || pathname === "/buyer/notifications",
    mode: "buyer",
  },
];

const sellerItems: NavItem[] = [
  {
    href: "/seller/search",
    label: "Find buyers",
    isActive: (pathname) =>
      pathname === "/seller/search" || pathname.startsWith("/buyers/") || pathname.startsWith("/seller/invite/"),
    mode: "seller",
  },
  {
    href: "/seller/properties",
    label: "Properties",
    isActive: (pathname) => pathname.startsWith("/seller/properties"),
    mode: "seller",
  },
  {
    href: "/seller/invites",
    label: "Sent invites",
    isActive: (pathname) => pathname === "/seller/invites" || pathname === "/seller/notifications",
    mode: "seller",
  },
];

const adminItem: NavItem = {
  href: "/admin",
  label: "Admin",
  isActive: (pathname) => pathname.startsWith("/admin"),
  mode: "admin",
};

const messagesItem: NavItem = {
  href: "/messages",
  label: "Messages",
  isActive: (pathname) => pathname === "/messages" || pathname.startsWith("/messages/"),
};

export function primaryNavItems(isAuthenticated: boolean, roles: AppRole[], messagingEnabled = false) {
  if (!isAuthenticated) return [demandMapItem, ...guestItems];

  const items: NavItem[] = [demandMapItem];
  if (roles.includes("BUYER")) items.push(...buyerItems);
  if (roles.includes("SELLER")) items.push(...sellerItems);
  if (messagingEnabled && (roles.includes("BUYER") || roles.includes("SELLER"))) items.push(messagesItem);
  if (roles.includes("ADMIN")) items.push(adminItem);
  return items;
}
