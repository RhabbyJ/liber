import type { ReactNode } from "react";

type Tone = "buyer" | "seller" | "admin";

export function PageTitle({
  eyebrow,
  title,
  tone,
  badge,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  tone?: Tone;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const eyebrowClass = tone === "seller" || tone === "admin" ? `eyebrow ${tone}` : "eyebrow";

  return (
    <section className="page-title">
      {(eyebrow || badge) ? (
        <div className="page-title-top">
          {badge}
          {eyebrow ? <span className={eyebrowClass}>{eyebrow}</span> : null}
        </div>
      ) : null}
      <div className="section-head">
        <h1>{title}</h1>
        {actions ? <div className="actions inline">{actions}</div> : null}
      </div>
      {children ? <div className="muted">{children}</div> : null}
    </section>
  );
}
