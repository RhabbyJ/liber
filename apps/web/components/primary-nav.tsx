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
    isActive: (p) => p === "/buyer/profile" || p === "/buyer/badges",
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
    label: "Buyers",
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
    label: "Invites",
    isActive: (p) => p === "/seller/invites" || p === "/seller/notifications",
    mode: "seller",
  },
];

const adminItem: NavItem = {
  href: "/admin",
  label: "Admin",
  isActive: (p) => p.startsWith("/admin"),
  mode: "admin",
};

const PRIMARY_NAV_FALLBACK = `
(() => {
  function init(shell) {
    if (shell.dataset.primaryNavFallbackReady === "true") return;
    shell.dataset.primaryNavFallbackReady = "true";

    const button = shell.querySelector("[data-mobile-menu-button]");
    const nav = shell.querySelector("[data-primary-nav-menu]");
    const actions = shell.querySelector("[data-mobile-nav-actions]");
    if (!button || !nav) return;

    function setOpen(isOpen) {
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
      button.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
      nav.classList.toggle("open", isOpen);
      if (actions) {
        actions.hidden = !isOpen;
        actions.setAttribute("aria-hidden", isOpen ? "false" : "true");
      }
    }

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(button.getAttribute("aria-expanded") !== "true");
    }, true);

    nav.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("a")) setOpen(false);
    }, true);

    setOpen(button.getAttribute("aria-expanded") === "true");
  }

  function boot() {
    document.querySelectorAll("[data-primary-nav]").forEach(init);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
`;

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

  const items: NavItem[] = [];
  if (!isAuthenticated) {
    items.push(homeItem);
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
    <div className="nav-shell" data-primary-nav>
      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        className="mobile-menu-button"
        data-mobile-menu-button
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <Icon name={isOpen ? "arrow-right" : "menu"} size={16} />
      </button>
      <nav aria-label="Primary" className={`nav ${isOpen ? "open" : ""}`} data-primary-nav-menu>
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
        <div className="mobile-nav-actions" data-mobile-nav-actions hidden={!isOpen} aria-hidden={isOpen ? "false" : "true"}>
          {isAuthenticated ? (
            <form action="/logout" method="post">
              <button className="button ghost" type="submit">
                <Icon name="logout" size={15} />
                Sign out
              </button>
            </form>
          ) : (
            <>
              <Link className="button ghost" href="/login" onClick={close}>Log in</Link>
              <Link className="button primary" href="/signup?role=seller&next=/seller/search" onClick={close}>
                Find buyers
              </Link>
              <Link className="button secondary" href="/signup?role=buyer&next=/buyer/profile" onClick={close}>
                Add buyer demand
              </Link>
            </>
          )}
        </div>
      </nav>
      <script dangerouslySetInnerHTML={{ __html: PRIMARY_NAV_FALLBACK }} />
    </div>
  );
}

