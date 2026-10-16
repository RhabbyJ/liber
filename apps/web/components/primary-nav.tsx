"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AppRole } from "../server/authz";
import { isElementRendered } from "./element-visibility";
import { focusableElements, focusTrapTarget } from "./focus-trap";
import { Icon } from "./icon";
import { unreadConversationBadgeText, useUnreadConversationCount } from "./messaging/unread-conversations";
import { primaryNavItems } from "./primary-nav-items";
import "./primary-nav.css";

const MESSAGES_HREF = "/messages";

// Before hydration this script runs the phone drawer on its own. Once React
// marks the shell hydrated, every listener stands down so the component's
// focus handling owns the drawer.
const PRIMARY_NAV_FALLBACK = `
(() => {
  function init(shell) {
    if (shell.dataset.primaryNavFallbackReady === "true") return;
    shell.dataset.primaryNavFallbackReady = "true";

    const button = shell.querySelector("[data-mobile-menu-button]");
    const nav = shell.querySelector("[data-primary-nav-menu]");
    const actions = shell.querySelector("[data-mobile-nav-actions]");
    if (!button || !nav) return;
    const hydrated = () => shell.dataset.primaryNavHydrated === "true";

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
      if (hydrated()) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(button.getAttribute("aria-expanded") !== "true");
    }, true);

    nav.addEventListener("click", (event) => {
      if (hydrated()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("a")) setOpen(false);
    }, true);

    document.addEventListener("keydown", (event) => {
      if (hydrated()) return;
      if (event.key === "Escape") {
        setOpen(false);
        if (nav.contains(document.activeElement)) button.focus();
      }
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
  nonce,
  previewToolsEnabled,
  roles,
}: {
  isAuthenticated: boolean;
  messagingEnabled: boolean;
  nonce?: string;
  previewToolsEnabled: boolean;
  roles: AppRole[];
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const navId = useId();
  const items = primaryNavItems(isAuthenticated, roles, messagingEnabled, previewToolsEnabled);
  // Published by the header bell's poll; null whenever messaging is off for this account.
  const unreadConversations = useUnreadConversationCount() ?? 0;

  const closeMenu = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) toggleRef.current?.focus({ preventScroll: true });
  }, []);

  /** Links and the profile action close the drawer; focus returns to the toggle instead of <body>. */
  function closeFromMenu() {
    const active = document.activeElement;
    closeMenu(isOpen && (active === document.body || Boolean(navRef.current?.contains(active))));
  }

  // Take over from the pre-hydration fallback, adopting a drawer it already opened.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (toggleRef.current?.getAttribute("aria-expanded") === "true") setIsOpen(true);
    shell.dataset.primaryNavHydrated = "true";
    return () => {
      delete shell.dataset.primaryNavHydrated;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // The open drawer covers the page below the header: keep Tab inside the toggle
  // and the drawer, close on Escape with focus back on the toggle, and close
  // without moving focus if focus leaves (for example to the notification bell)
  // or the bar replaces the drawer at desktop widths.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = focusTrapTarget(
        focusableElements([toggleRef.current, navRef.current]),
        document.activeElement,
        event.shiftKey,
      );
      if (!target) return;
      event.preventDefault();
      target.focus();
    }
    function onFocusIn(event: FocusEvent) {
      if (event.target instanceof Node && !shellRef.current?.contains(event.target)) closeMenu(false);
    }
    function onResize() {
      if (!isElementRendered(toggleRef.current)) closeMenu(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("resize", onResize);
    };
  }, [closeMenu, isOpen]);

  return (
    <div
      className="nav-shell"
      data-dense={items.length >= 7 || undefined}
      data-primary-nav
      ref={shellRef}
      // The pre-hydration fallback script stamps a ready flag on this element.
      suppressHydrationWarning
    >
      <button
        aria-controls={navId}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        className="mobile-menu-button"
        data-mobile-menu-button
        onClick={() => setIsOpen((value) => !value)}
        ref={toggleRef}
        type="button"
      >
        <span aria-hidden="true" className="mobile-menu-bars" />
      </button>
      <nav aria-label="Primary" className={`nav ${isOpen ? "open" : ""}`} data-primary-nav-menu id={navId} ref={navRef}>
        {navGroups(items).map((group, groupIndex) => (
          <div className={`nav-group${groupIndex === 1 ? " end" : ""}`} key={groupIndex}>
            {group.map((item) => {
              const active = item.isActive(pathname);
              const modeClass = item.mode ? ` ${item.mode}` : "";
              const unread = messagingEnabled && item.href === MESSAGES_HREF ? unreadConversations : 0;

              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? `nav-link active${modeClass}` : "nav-link"}
                  data-label={item.label}
                  href={item.href}
                  key={`${item.href}-${item.label}`}
                  onClick={closeFromMenu}
                >
                  {unread > 0 ? (
                    <span className="nav-link-label">
                      {item.label}
                      <span aria-hidden="true" className="nav-unread-badge">{unreadConversationBadgeText(unread)}</span>
                      <span className="visually-hidden">
                        , {unread > 99 ? "more than 99" : unread} unread {unread === 1 ? "conversation" : "conversations"}
                      </span>
                    </span>
                  ) : item.label}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="mobile-nav-actions" data-mobile-nav-actions hidden={!isOpen} aria-hidden={isOpen ? "false" : "true"}>
          {isAuthenticated ? (
            <>
              <Link className="button secondary block" href="/profile" onClick={closeFromMenu}>Your profile</Link>
              <form action="/logout" method="post">
                <button className="button secondary block" type="submit">
                  <Icon name="logout" size={16} />
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link className="button primary block" href="/signup" onClick={closeFromMenu}>
                Get started
              </Link>
              <Link className="button secondary block" href="/login" onClick={closeFromMenu}>Log in</Link>
            </>
          )}
        </div>
      </nav>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: PRIMARY_NAV_FALLBACK }} />
    </div>
  );
}

/** Zillow's split bar: short navs sit left of the centred logo; longer ones put their second half on the right. */
function navGroups<T>(items: T[]) {
  const splitAt = items.length <= 3 ? items.length : Math.ceil(items.length / 2);
  return [items.slice(0, splitAt), items.slice(splitAt)];
}
