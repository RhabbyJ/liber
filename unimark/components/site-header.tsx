"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { nav } from "@/content/site";
import { track } from "@/lib/track";
import { Logo } from "./brand/logo";
import { StoreButtons } from "./store-buttons";

function isActive(pathname: string, href: string) {
  return !href.includes("#") && pathname === href;
}

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the menu on route change (e.g. after tapping a link).
  useEffect(() => {
    menuRef.current?.close();
  }, [pathname]);

  const openMenu = () => menuRef.current?.showModal();
  const closeMenu = () => menuRef.current?.close();

  // Over the dark page heroes the header is transparent with light content;
  // once scrolled it becomes a light bar.
  const light = !scrolled;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
        scrolled ? "bg-paper/95 shadow-[0_1px_0_rgb(27_28_40/0.08)] backdrop-blur-xl backdrop-saturate-150" : "bg-transparent"
      }`}
    >
      <div className="container-site flex h-[4.5rem] items-center justify-between gap-6">
        <Link href="/" className="-m-2 rounded-lg p-2" aria-label="UniMark home">
          <Logo tone={light ? "light" : "ink"} className="h-7 w-auto sm:h-8" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-[0.92rem] font-semibold transition-colors ${
                light ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-ink/75 hover:bg-ink/5 hover:text-ink"
              } aria-[current=page]:text-teal`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/get/"
            onClick={() => track({ name: "cta_click", props: { id: "get-the-app", placement: "header" } })}
            className="btn btn-sm btn-primary"
          >
            Get the app
          </Link>
          <button
            type="button"
            onClick={openMenu}
            aria-haspopup="dialog"
            aria-controls="mobile-menu"
            className={`grid size-11 place-items-center rounded-full transition-colors lg:hidden ${
              light ? "text-white hover:bg-white/10" : "text-ink hover:bg-ink/5"
            }`}
          >
            <span className="sr-only">Open menu</span>
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 8h16M4 16h16" />
            </svg>
          </button>
        </div>
      </div>

      <dialog
        id="mobile-menu"
        ref={menuRef}
        aria-label="Menu"
        className="menu-sheet lg:hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeMenu();
        }}
      >
        <div className="flex h-full flex-col">
          <div className="container-site flex h-[4.5rem] shrink-0 items-center justify-between">
            <Logo tone="light" className="h-7 w-auto" />
            <button
              type="button"
              onClick={closeMenu}
              autoFocus
              className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
            >
              <span className="sr-only">Close menu</span>
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <nav aria-label="Mobile" className="container-site mt-6 flex-1">
            <ul className="flex flex-col">
              {[{ label: "Home", href: "/" }, ...nav, { label: "Contact", href: "/contact/" }].map((item, i) => (
                <li key={item.href} className="menu-item border-b border-line-dark" style={{ "--i": i } as React.CSSProperties}>
                  <Link
                    href={item.href}
                    onClick={closeMenu}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    className="group flex items-center justify-between py-5 text-[1.75rem] font-extrabold tracking-[-0.03em] text-white aria-[current=page]:text-teal"
                  >
                    {item.label}
                    <svg viewBox="0 0 24 24" className="size-6 text-white/30 transition-transform group-hover:translate-x-1 group-hover:text-teal" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14m-5-5l5 5-5 5" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="menu-item container-site shrink-0 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6" style={{ "--i": nav.length + 2 } as React.CSSProperties}>
            <p className="mb-4 text-sm font-semibold text-muted-dark">Get the UniMark app</p>
            <StoreButtons placement="mobile-menu" variant="light" className="[&>li]:flex-1 [&_a]:w-full" />
          </div>
        </div>
      </dialog>
    </header>
  );
}
