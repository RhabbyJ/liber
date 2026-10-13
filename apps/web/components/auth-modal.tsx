"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./icon";

const focusableSelector = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const firstFieldSelector = 'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"])';

/** Shows the auth card over the current page for in-app navigations; Back, Escape, or the backdrop close it. */
export function AuthModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Parallel slots keep their last page across soft navigations, so leaving the auth routes must hide the dialog here.
  const open = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    if (!open) return;
    // Interception also catches auth links clicked on the full /login and /signup pages; show those as pages.
    if (document.querySelector(".app-shell .auth-page")) {
      window.location.replace(window.location.href);
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog || dialog.contains(document.activeElement)) return;
    dialog.querySelector<HTMLElement>(firstFieldSelector)?.focus();
  }, [open, pathname]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      router.back();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <div
      className="auth-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) router.back();
      }}
      role="presentation"
    >
      <div aria-labelledby="auth-title" aria-modal="true" className="auth-modal-dialog" onKeyDown={handleKeyDown} ref={dialogRef} role="dialog">
        <button aria-label="Close" className="icon-button auth-modal-close" onClick={() => router.back()} type="button">
          <Icon name="close" size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
