import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Zillow's split sign-in page: a narrow form panel beside a full-height photograph.
 * The site header and footer are hidden on these pages (see `.auth-split` in globals.css).
 */
export function AuthShell({
  children,
  context,
  title,
}: {
  children: ReactNode;
  context?: ReactNode;
  title: string;
}) {
  return (
    <div className="auth-split">
      <section aria-labelledby="auth-title" className="auth-panel">
        <div className="auth-panel-inner">
          <Link aria-label="Liber home" className="brand auth-brand" href="/">
            <span aria-hidden="true" className="brand-mark" />
            <span className="brand-name">Liber</span>
          </Link>
          <h1 id="auth-title">{title}</h1>
          {context ? <p className="auth-context">{context}</p> : null}
          {children}
        </div>
      </section>
      <div aria-hidden="true" className="auth-art">
        <Image
          alt=""
          className="auth-art-image"
          fill
          priority
          sizes="(max-width: 899px) 0px, calc(100vw - 480px)"
          src="/images/homes/auth-hero.webp"
        />
      </div>
    </div>
  );
}
