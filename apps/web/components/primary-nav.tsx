"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AppRole } from "../server/authz";
import { Icon } from "./icon";

type NavItem = {
  href: string;
  isActive: (pathname: string) => boolean;
  label: string;
  mode?: "buyer" | "seller" | "admin";
};

const homeItem: NavItem = {
  href: "/",
  isActive: (pathname) => pathname === "/",
  label: "Home",
};

const buyerItems: NavItem[] = [
  {
    href: "/buyer/profile",
    label: "Profile",
    isActive: (p) => p === "/buyer/profile" || p === "/buyer/criteria",
    mode: "buyer",
  },
  {
    href: "/buyer/badges",
    label: "Verification",
    isActive: (p) => p === "/buyer/badges",
    mode: "buyer",
  },
  {
    href: "/buyer/invites",
    label: "Invites",
    isActive: (p) => p === "/buyer/invites" || p === "/buyer/notifications",
    mode: "buyer",
  },
];

const sellerItems: NavItem[] = [
  {
    href: "/seller/search",
    label: "Search buyers",
    isActive: (p) => p === "/seller/search" || p.startsWith("/buyers/") || p.startsWith("/seller/invite/"),
    mode: "seller",
  },
  {
    href: "/seller/properties",
    label: "Properties",
    isActive: (p) => p.startsWith("/seller/properties"),
    mode: "seller",
  },
  {
    href: "/seller/invites",
    label: "Sent invites",
    isActive: (p) => p === "/seller/invites" || p === "/seller/notifications",
    mode: "seller",
  },
];

const publicItems: NavItem[] = [
  {
    href: "/signup?role=buyer&next=/buyer/profile",
    label: "For Buyers",
    isActive: () => false,
    mode: "buyer",
  },
  {
    href: "/signup?role=seller&next=/seller/search",
    label: "For Sellers",
    isActive: () => false,
    mode: "seller",
  },
];

const adminItem: NavItem = {
  href: "/admin",
  label: "Admin",
  isActive: (p) => p.startsWith("/admin"),
  mode: "admin",
};

export function PrimaryNav({
  isAuthenticated,
  roles,
}: {
  isAuthenticated: boolean;
  roles: AppRole[];
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const hasBuyer = roles.includes("BUYER");
  const hasSeller = roles.includes("SELLER");
  const hasAdmin = roles.includes("ADMIN");

  const items: NavItem[] = [homeItem];
  if (!isAuthenticated) {
    items.push(...publicItems);
  } else {
    if (hasBuyer) items.push(...buyerItems);
    if (hasSeller) items.push(...sellerItems);
    if (hasAdmin) items.push(adminItem);
    if (!hasBuyer && !hasSeller && !hasAdmin) {
      items.push({
        href: "/onboarding/role",
        label: "Choose role",
        isActive: (p) => p === "/onboarding/role",
      });
    }
  }

  function close() {
    setIsOpen(false);
  }

  return (
    <div className="nav-shell">
      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        className="mobile-menu-button"
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <Icon name={isOpen ? "arrow-right" : "menu"} size={16} />
      </button>
      <nav aria-label="Primary" className={`nav ${isOpen ? "open" : ""}`}>
        {items.map((item) => {
          const active = item.isActive(pathname);
          const modeClass = item.mode ? ` ${item.mode}` : "";

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={active ? `active${modeClass}` : undefined}
              href={item.href}
              key={`${item.href}-${item.label}`}
              onClick={close}
            >
              {item.label}
            </Link>
          );
        })}
        <div className="mobile-nav-actions">
          {isAuthenticated ? (
            <>
              <Link className="button secondary" href={accountHrefForRoles(roles)} onClick={close}>
                <Icon name="user" size={15} />
                Account
              </Link>
              <form action="/logout" method="post">
                <button className="button ghost" type="submit">
                  <Icon name="logout" size={15} />
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link className="button ghost" href="/login" onClick={close}>Log in</Link>
              <Link className="button primary" href="/signup" onClick={close}>
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}

function accountHrefForRoles(roles: AppRole[]) {
  if (roles.includes("ADMIN")) return "/admin";
  if (roles.includes("BUYER")) return "/buyer/profile";
  if (roles.includes("SELLER")) return "/seller/search";
  return "/onboarding/role";
}
