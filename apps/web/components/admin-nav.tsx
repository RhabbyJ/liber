"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/buyer-profiles", label: "Buyer profiles" },
  { href: "/admin/badges", label: "Badges" },
  { href: "/admin/documents", label: "Documents" },
  { href: "/admin/invites", label: "Invites" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/audit-log", label: "Audit log" },
];

/** Persistent admin sub-navigation; the current section is marked, not linked. */
export function AdminNav() {
  const pathname = usePathname();
  const current = sections.reduce((match, section) =>
    (pathname === section.href || pathname.startsWith(`${section.href}/`)) && section.href.length > match.length ? section.href : match, "");

  return (
    <div className="admin-subnav">
      <nav aria-label="Admin sections" className="workspace-tabs">
        {sections.map((section) =>
          section.href === current ? (
            <span aria-current="page" className="workspace-tab current" key={section.href}>{section.label}</span>
          ) : (
            <Link className="workspace-tab" href={section.href} key={section.href}>{section.label}</Link>
          ),
        )}
      </nav>
    </div>
  );
}
