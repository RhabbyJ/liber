"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icon";

type Props = {
  align?: "end" | "start";
  appliedLabel?: string;
  children: (close: () => void) => ReactNode;
  icon?: ReactNode;
  label: string;
  panelClassName?: string;
};

/**
 * Search-toolbar dropdown: a bordered trigger that opens an anchored panel.
 * Escape and outside presses close it and return focus to the trigger.
 */
export function FilterPopover({ align = "start", appliedLabel, children, icon, label, panelClassName }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (focusRequest > 0) triggerRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setIsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function close() {
    setIsOpen(false);
    setFocusRequest((count) => count + 1);
  }

  const isApplied = Boolean(appliedLabel);

  return (
    <div className={`filter-popover${isOpen ? " open" : ""}`} ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        className={`filter-button${isApplied ? " applied" : ""}`}
        onClick={() => setIsOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        {icon}
        <span className="filter-button-label">{appliedLabel || label}</span>
        <Icon className="filter-button-chevron" name="chevron-down" size={16} />
      </button>
      <div
        aria-label={label}
        className={`filter-panel ${align === "end" ? "align-end" : ""}${panelClassName ? ` ${panelClassName}` : ""}`}
        hidden={!isOpen}
        id={panelId}
        role="dialog"
      >
        {isOpen ? children(close) : null}
      </div>
    </div>
  );
}
