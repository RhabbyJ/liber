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
                  <span className="notification-dot" aria-hidden="true" />
                  <Link className="button" href="/onboarding/role">
                    My Account
                  </Link>
                  <a className="button secondary" href="/logout">
                    Logout
                  </a>
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
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
