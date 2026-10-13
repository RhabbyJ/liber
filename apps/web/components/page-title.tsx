import type { ReactNode } from "react";

export function PageTitle({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div className="page-title-text">
        <h1>{title}</h1>
        {children ? <p className="page-title-meta">{children}</p> : null}
      </div>
      {actions ? <div className="page-title-actions">{actions}</div> : null}
    </header>
  );
}
