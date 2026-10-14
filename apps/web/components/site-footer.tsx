import Link from "next/link";
import { messagingV1NavigationEnabledForUser } from "../server/messaging/feature";
import { getSessionUser } from "../server/session";
import { primaryNavItems } from "./primary-nav-items";
import { Skyline } from "./skyline";

type FooterLink = { href: string; label: string };

const legalLines = [
  "Liber is a private directory of buyer demand. Properties stay private and outreach is manual.",
  "Liber is not an escrow, lender, or transaction execution service. Invites are not offers, escrow instructions, funds custody, or automated transactions.",
];

/** Only links that resolve for the viewer: Messages follows the header nav, and account links follow the session. */
function footerColumns(isAuthenticated: boolean, showMessages: boolean) {
  const liberLinks: FooterLink[] = [
    ...(showMessages ? [{ href: "/messages", label: "Messages" }] : []),
    ...(isAuthenticated
      ? [{ href: "/profile", label: "Your profile" }]
      : [{ href: "/login", label: "Log in" }, { href: "/signup", label: "Create an account" }]),
  ];

  return [
    {
      heading: "For sellers",
      id: "footer-sellers",
      links: [
        { href: "/", label: "Find buyers" },
        { href: "/seller/properties", label: "Your properties" },
        { href: "/seller/properties/new", label: "Add a property" },
        { href: "/seller/invites", label: "Sent invites" },
      ],
    },
    {
      heading: "For buyers",
      id: "footer-buyers",
      links: [
        { href: "/buyer/profile", label: "Create a buyer profile" },
        { href: "/buyer/badges", label: "Get verified" },
        { href: "/buyer/invites", label: "Received invites" },
      ],
    },
    { heading: "Liber", id: "footer-liber", links: liberLinks },
  ];
}

export async function SiteFooter({ variant = "full" }: { variant?: "compact" | "full" }) {
  const user = await getSessionUser();
  const messagingEnabled = user ? messagingV1NavigationEnabledForUser(user.id) : false;
  const showMessages = primaryNavItems(Boolean(user), user?.roles ?? [], messagingEnabled).some((item) => item.href === "/messages");
  const columns = footerColumns(Boolean(user), showMessages);

  if (variant === "compact") {
    return (
      <footer className="site-footer compact">
        <nav aria-label="Footer" className="site-footer-compact-links">
          {columns.flatMap((column) => column.links).map((link) => (
            <Link href={link.href} key={link.href}>{link.label}</Link>
          ))}
        </nav>
        {legalLines.map((line) => <p key={line}>{line}</p>)}
        <p className="site-footer-copyright">Copyright © 2026 Liber. All rights reserved.</p>
      </footer>
    );
  }

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <nav aria-label="Footer" className="site-footer-columns">
          {columns.map((column) => (
            <section aria-labelledby={column.id} className="site-footer-column" key={column.id}>
              <h2 id={column.id}>{column.heading}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        <div className="site-footer-legal">
          <p className="site-footer-brandline">
            <span className="brand-mark" aria-hidden="true" />
            Copyright © 2026 Liber. All rights reserved.
          </p>
          {legalLines.map((line) => <p key={line}>{line}</p>)}
        </div>
      </div>
      <Skyline className="site-footer-skyline" />
    </footer>
  );
}
