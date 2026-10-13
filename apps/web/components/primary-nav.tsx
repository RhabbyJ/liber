"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppRole } from "../server/authz";
import { Icon } from "./icon";
import { primaryNavItems } from "./primary-nav-items";

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

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });

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
  messagingEnabled,
  previewToolsEnabled,
  roles,
}: {
  isAuthenticated: boolean;
  messagingEnabled: boolean;
  previewToolsEnabled: boolean;
  roles: AppRole[];
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const items = primaryNavItems(isAuthenticated, roles, messagingEnabled, previewToolsEnabled);

  function close() {
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <div
      className="nav-shell"
      data-primary-nav
      // The pre-hydration fallback script stamps a ready flag on this element.
      suppressHydrationWarning
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        className="mobile-menu-button"
        data-mobile-menu-button
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <Icon className="mobile-menu-icon-open" name="menu" size={22} />
        <Icon className="mobile-menu-icon-close" name="close" size={22} />
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
            <>
              <Link className="button secondary block" href="/profile" onClick={close}>Your profile</Link>
              <form action="/logout" method="post">
                <button className="button ghost block" type="submit">
                  <Icon name="logout" size={16} />
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link className="button primary block" href="/signup" onClick={close}>
                Get started
              </Link>
              <Link className="button secondary block" href="/login" onClick={close}>Log in</Link>
            </>
          )}
        </div>
      </nav>
      <script dangerouslySetInnerHTML={{ __html: PRIMARY_NAV_FALLBACK }} />
    </div>
  );
}

