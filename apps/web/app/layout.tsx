import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { publicNameForDisplay } from "../server/public-identity";
import { AccountMenu } from "../components/account-menu";
import { PrimaryNav } from "../components/primary-nav";
import { NotificationBell } from "../components/notification-bell";
import { SiteFooter } from "../components/site-footer";
import { messagingV1NavigationEnabledForUser } from "../server/messaging/feature";
import { ceoPreviewToolsEnabled } from "../server/ceo-preview";
import { getSessionUser } from "../server/session";
import { readNotificationActivity, withUnreadConversationCount } from "../server/notifications";
import "./globals.css";
import "../components/notification-bell.css";

const openSans = localFont({
  display: "swap",
  src: "./fonts/open-sans-latin-wght-normal.woff2",
  variable: "--font-open-sans",
  weight: "300 800",
});

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  // Child pages set their own title ("Log in" → "Log in · Liber"); the default covers pages without one.
  title: {
    default: "Liber — A buyer-first real estate marketplace",
    template: "%s · Liber",
  },
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
  const notificationActivity = user
    ? await readNotificationActivity(user).then((activity) => withUnreadConversationCount(user, activity)).catch(() => null)
    : null;

  return (
    <html className={openSans.variable} lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <div className="app-shell">
          <header className="site-header">
            <div className="site-header-inner">
              <Link className="brand" href="/" aria-label="Liber home">
                <span className="brand-mark" aria-hidden="true" />
                <span className="brand-name">Liber</span>
              </Link>
              <PrimaryNav
                nonce={nonce}
                isAuthenticated={isAuthenticated}
                messagingEnabled={messagingEnabled}
                previewToolsEnabled={previewToolsEnabled}
                roles={roles}
              />
              <div className="top-actions">
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
                      displayName={user ? publicNameForDisplay(user.name, user.id) : "Account"}
                      profileHref="/profile"
                      userId={user?.id ?? "account"}
                    />
                  </>
                ) : (
                  <>
                    <Link className="header-text-link" href="/login">Log in</Link>
                    <Link className="button primary header-cta" href="/signup">
                      Get started
                    </Link>
                  </>
                )}
              </div>
            </div>
          </header>
          <main id="main-content">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}

function notificationHrefForRoles(roles: string[]) {
  if (roles.includes("BUYER")) return "/buyer/notifications";
  if (roles.includes("SELLER")) return "/seller/notifications";
  return "/notifications";
}
