"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppRole } from "../server/authz";

type NavItem = {
  href: string;
  isActive: (pathname: string) => boolean;
  label: string;
};

const baseNavItems: NavItem[] = [
  {
    href: "/",
    label: "Home",
    isActive: (pathname: string) => pathname === "/",
  },
  {
    href: "/buyer/profile",
    label: "Buyers",
    isActive: (pathname: string) =>
      pathname === "/buyer/profile" ||
      pathname === "/buyer/criteria" ||
      pathname === "/buyer/invites" ||
      pathname === "/buyer/notifications" ||
      pathname.startsWith("/buyers/"),
  },
  {
    href: "/seller/search",
    label: "Sellers",
    isActive: (pathname: string) =>
      pathname === "/seller/search" ||
      pathname === "/seller/invites" ||
      pathname.startsWith("/seller/invite/"),
  },
  {
    href: "/buyer/badges",
    label: "Verify",
    isActive: (pathname: string) =>
      pathname === "/buyer/badges" ||
      pathname === "/admin/documents" ||
      pathname === "/admin/badges",
  },
  {
    href: "/seller/properties",
    label: "Properties",
    isActive: (pathname: string) => pathname.startsWith("/seller/properties"),
  },
];

export function PrimaryNav({
  isAuthenticated,
  roles,
}: {
  isAuthenticated: boolean;
  roles: AppRole[];
}) {
  const pathname = usePathname();
  const navItems = navItemsForRoles(isAuthenticated, roles);

  return (
    <nav className="nav" aria-label="Primary">
      {navItems.map((item) => {
        const active = item.isActive(pathname);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "active" : undefined}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function navItemsForRoles(isAuthenticated: boolean, roles: AppRole[]) {
  const hasBuyer = roles.includes("BUYER") || roles.includes("ADMIN");
  const hasSeller = roles.includes("SELLER") || roles.includes("ADMIN");

  return baseNavItems.map((item) => {
    if (!isAuthenticated) return item;

    if ((item.href.startsWith("/seller/search") || item.href.startsWith("/seller/properties")) && !hasSeller) {
      return {
        ...item,
        href: `/onboarding/role?next=${encodeURIComponent(item.href)}`,
      };
    }

    if ((item.href.startsWith("/buyer/profile") || item.href.startsWith("/buyer/badges")) && !hasBuyer) {
      return {
        ...item,
        href: `/onboarding/role?next=${encodeURIComponent(item.href)}`,
      };
    }

    return item;
  });
}
