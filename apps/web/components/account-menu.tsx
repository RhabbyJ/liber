"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { GeneratedAvatar } from "./generated-avatar";

export function AccountMenu({
  avatarVariant,
  profileHref,
  userId,
}: {
  avatarVariant?: string | null;
  profileHref: string;
  userId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const firstItem = menuRef.current?.querySelector<HTMLElement>("[role='menuitem']");
    firstItem?.focus();

    function closeOnOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !shellRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [isOpen]);

  function closeAndReturnFocus() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndReturnFocus();
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
    if (items.length === 0) return;

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowUp"
          ? (currentIndex - 1 + items.length) % items.length
          : (currentIndex + 1) % items.length;
    items[nextIndex]?.focus();
  }

  return (
    <div
      className="account-menu"
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
      ref={shellRef}
    >
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={isOpen ? "Close account menu" : "Open account menu"}
        className="account-menu-trigger"
        onClick={() => setIsOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <GeneratedAvatar
          alt="Your profile"
          className="account-menu-avatar"
          seed={userId}
          size="sm"
          variant={avatarVariant}
        />
      </button>

      <div
        aria-label="Account"
        className="account-menu-popover"
        hidden={!isOpen}
        onKeyDown={handleMenuKeyDown}
        ref={menuRef}
        role="menu"
      >
        <Link className="account-menu-item" href={profileHref} onClick={() => setIsOpen(false)} role="menuitem">
          Your profile
        </Link>
        <div className="account-menu-divider" role="separator" />
        <form action="/logout" method="post">
          <button className="account-menu-item" role="menuitem" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
