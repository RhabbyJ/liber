import Link from "next/link";

type Tab = { badge?: number; href: string; label: string };

/** Redfin "My Redfin" style tabs for sibling workspace pages; the current page is not a link. */
export function WorkspaceTabs({ current, label, tabs }: { current: string; label: string; tabs: Tab[] }) {
  return (
    <nav aria-label={label} className="workspace-tabs">
      {tabs.map((tab) =>
        tab.href === current ? (
          <span aria-current="page" className="workspace-tab current" key={tab.href}>
            {tab.label}
            {tab.badge ? <span className="workspace-tab-badge">{tab.badge}</span> : null}
          </span>
        ) : (
          <Link className="workspace-tab" href={tab.href} key={tab.href}>
            {tab.label}
            {tab.badge ? <span className="workspace-tab-badge">{tab.badge}</span> : null}
          </Link>
        ),
      )}
    </nav>
  );
}
