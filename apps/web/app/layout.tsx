import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "../components/icon";
import { PrimaryNav } from "../components/primary-nav";
import { getSessionUser } from "../server/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liber — A buyer-first real estate marketplace",
  description:
    "Buyers create verified demand profiles. Sellers search for serious buyers and send manual invites for their private properties.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  const isAuthenticated = Boolean(user);
  const roles = user?.roles ?? [];

  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/" aria-label="Liber home">
              <span className="brand-mark" aria-hidden="true" />
              <span className="brand-text">
                <span className="brand-name">Liber</span>
                <span className="brand-subtitle">Buyer Directory</span>
              </span>
            </Link>
            <PrimaryNav isAuthenticated={isAuthenticated} roles={roles} />
            <div className="top-actions">
              {isAuthenticated ? (
                <>
                  <Link
                    aria-label="Notifications"
                    className="notification-button"
                    data-unread="true"
                    href={notificationHrefForRoles(roles)}
                  >
                    <Icon name="bell" size={18} />
                  </Link>
                  <form action="/logout" method="post">
                    <button className="button ghost" type="submit" aria-label="Log out">
                      <Icon name="logout" size={15} />
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link className="button ghost" href="/login">Log in</Link>
                  <Link className="button primary" href="/signup">
                    Get started
                    <Icon name="arrow-right" size={14} />
                  </Link>
                </>
              )}
            </div>
          </header>
          <main id="main-content">{children}</main>
          <footer className="site-footer">
            <div className="site-footer-inner">
              <div>
                <h3>Liber</h3>
                <p>
                  A buyer directory for sellers who want to find real demand before they list. Properties stay private; outreach is manual.
                </p>
                <p className="small" style={{ marginTop: 14 }}>
                  Liber is not an escrow, lender, or transaction execution service.
                </p>
              </div>
              <div>
                <h4>For Buyers</h4>
                <p><Link href="/buyer/profile">Create a profile</Link></p>
                <p><Link href="/buyer/badges">Get verified</Link></p>
              </div>
              <div>
                <h4>For Sellers</h4>
                <p><Link href="/seller/search">Find buyers</Link></p>
                <p><Link href="/seller/properties">Private properties</Link></p>
                <p><Link href="/seller/invites">Sent invites</Link></p>
              </div>
              <div>
                <h4>Stay in touch</h4>
                <p className="small">Pilot updates from the San Fernando Valley market.</p>
                <div className="site-footer-newsletter" aria-label="Newsletter signup">
                  <input aria-label="Email address" placeholder="you@example.com" type="email" />
                  <button type="button">Join</button>
                </div>
              </div>
            </div>
            <div className="footer-bottom">
              <span className="footer-brand">
                <span className="brand-mark" aria-hidden="true" />
                <span className="brand-text">
                  <span className="brand-name">Liber</span>
                  <span className="brand-subtitle">© 2026</span>
                </span>
              </span>
              <span className="small">Private outreach only. No offers, no escrow, no payments.</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

function notificationHrefForRoles(roles: string[]) {
  if (roles.includes("BUYER")) return "/buyer/notifications";
  if (roles.includes("SELLER")) return "/seller/notifications";
  if (roles.includes("ADMIN")) return "/admin";
  return "/onboarding/role";
}
