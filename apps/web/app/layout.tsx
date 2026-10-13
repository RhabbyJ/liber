import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { publicNameForDisplay } from "../server/public-identity";
import { AccountMenu } from "../components/account-menu";
import { Icon } from "../components/icon";
import { PrimaryNav } from "../components/primary-nav";
import { NotificationBell } from "../components/notification-bell";
import { messagingV1NavigationEnabledForUser } from "../server/messaging/feature";
import { ceoPreviewToolsEnabled } from "../server/ceo-preview";
import { getSessionUser } from "../server/session";
import { readNotificationActivity } from "../server/notifications";
import "./globals.css";
import "../components/notification-bell.css";

export const metadata: Metadata = {
  title: "Liber — A buyer-first real estate marketplace",
  description:
    "Buyers create verified demand profiles. Sellers search for serious buyers and send manual invites for their private properties.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const user = await getSessionUser();
  const isAuthenticated = Boolean(user);
  const roles = user?.roles ?? [];
  const messagingEnabled = user ? messagingV1NavigationEnabledForUser(user.id) : false;
  const previewToolsEnabled = ceoPreviewToolsEnabled();
  const notificationActivity = user ? await readNotificationActivity(user).catch(() => null) : null;

  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <div className="app-shell">
          <header className={`topbar${isAuthenticated ? " has-notifications" : ""}`}>
            <Link className="brand" href="/" aria-label="Liber home">
              <span className="brand-mark" aria-hidden="true" />
              <span className="brand-text">
                <span className="brand-name">Liber</span>
                <span className="brand-subtitle">Buyer Directory</span>
              </span>
            </Link>
            <PrimaryNav
              nonce={nonce}
              isAuthenticated={isAuthenticated}
              messagingEnabled={messagingEnabled}
              previewToolsEnabled={previewToolsEnabled}
              roles={roles}
            />
            <div className={`top-actions${isAuthenticated ? " is-authenticated" : ""}`}>
              {isAuthenticated ? (
                <>
                  <NotificationBell
                    href={notificationHrefForRoles(roles)}
                    initialActivity={notificationActivity}
                    isBuyer={roles.includes("BUYER")}
                    key={user?.id}
                  />
                  <AccountMenu
                    avatarVariant={user?.avatarVariant}
                    displayName={user ? publicNameForDisplay(user.name, user.id) : undefined}
                    profileHref="/profile"
                    userId={user?.id ?? "account"}
                  />
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
  return "/";
}
