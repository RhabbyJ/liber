"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
      pathname === "/seller/notifications" ||
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
  const [isOpen, setIsOpen] = useState(false);
  const navItems = navItemsForRoles(isAuthenticated, roles);

  return (
    <div className="nav-shell">
      <button
        aria-expanded={isOpen}
        aria-label="Open navigation menu"
        className="mobile-menu-button"
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <span aria-hidden="true" />
      </button>
      <nav className={`nav ${isOpen ? "open" : ""}`} aria-label="Primary">
        {navItems.map((item) => {
          const active = item.isActive(pathname);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={active ? "active" : undefined}
              href={item.href}
              key={item.href}
              onClick={() => setIsOpen(false)}
            >
              {item.label}
            </Link>
          );
        })}
        <div className="mobile-nav-actions">
          {isAuthenticated ? (
            <>
              <Link className="button" href={accountHrefForRoles(roles)} onClick={() => setIsOpen(false)}>
                My Account
              </Link>
              <form action="/logout" method="post">
                <button className="button secondary" type="submit">Logout</button>
              </form>
            </>
          ) : (
            <>
              <Link className="button" href="/login" onClick={() => setIsOpen(false)}>Log in</Link>
              <Link className="button secondary" href="/signup" onClick={() => setIsOpen(false)}>Sign up</Link>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}

function navItemsForRoles(isAuthenticated: boolean, roles: AppRole[]) {
  const hasBuyer = roles.includes("BUYER");
  const hasSeller = roles.includes("SELLER");

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

function accountHrefForRoles(roles: AppRole[]) {
  if (roles.includes("ADMIN")) return "/admin";
  if (roles.includes("BUYER")) return "/buyer/profile";
  if (roles.includes("SELLER")) return "/seller/search";
  return "/onboarding/role";
}
