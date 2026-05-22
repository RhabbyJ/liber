import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PrimaryNav } from "../components/primary-nav";
import { getSessionUser } from "../server/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liber",
  description: "A searchable buyer directory for real estate sellers.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <span className="brand-mark" aria-hidden="true" />
              <span className="brand-text">
                <span className="brand-name">Liber</span>
                <span className="brand-subtitle">Buyer Directory</span>
              </span>
            </Link>
            <PrimaryNav isAuthenticated={Boolean(user)} roles={user?.roles ?? []} />
            <div className="top-actions">
              {user ? (
                <>
                  <Link className="notification-dot" href={notificationHrefForRoles(user.roles)} aria-label="Notifications" />
                  <Link className="button" href={accountHrefForRoles(user.roles)}>
                    My Account
                  </Link>
                  <form action="/logout" method="post">
                    <button className="button secondary" type="submit">Logout</button>
                  </form>
                </>
              ) : (
                <>
                  <Link className="button" href="/login">
                    Log in
                  </Link>
                  <Link className="button secondary" href="/signup">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </header>
          <main id="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}

function accountHrefForRoles(roles: string[]) {
  if (roles.includes("ADMIN")) return "/admin";
  if (roles.includes("BUYER")) return "/buyer/profile";
  if (roles.includes("SELLER")) return "/seller/search";
  return "/onboarding/role";
}

function notificationHrefForRoles(roles: string[]) {
  if (roles.includes("BUYER")) return "/buyer/notifications";
  return accountHrefForRoles(roles);
}
