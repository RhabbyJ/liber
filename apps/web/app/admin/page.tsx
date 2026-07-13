import Link from "next/link";
import { Icon } from "../../components/icon";
import { PageTitle } from "../../components/page-title";

type Section = {
  description: string;
  href: string;
  icon: "user" | "people" | "shield" | "doc" | "mail" | "info" | "list";
  title: string;
};

const adminSections: Section[] = [
  { title: "Users", href: "/admin/users", icon: "user", description: "Roles, suspensions, and profile ownership." },
  { title: "Buyer profiles", href: "/admin/buyer-profiles", icon: "people", description: "Visibility, suspicious profiles, moderation." },
  { title: "Badges", href: "/admin/badges", icon: "shield", description: "Manual grant, revoke, and expiration review." },
  { title: "Documents", href: "/admin/documents", icon: "doc", description: "Private ownership and verification files." },
  { title: "Invites", href: "/admin/invites", icon: "mail", description: "Abuse review and status tracking." },
  { title: "Reports", href: "/admin/reports", icon: "info", description: "Moderation queue for suspicious activity." },
  { title: "Audit log", href: "/admin/audit-log", icon: "list", description: "Sensitive admin action history." },
];

export default function AdminDashboardPage() {
  return (
    <div className="page stack loose">
      <PageTitle
        eyebrow="Internal admin"
        title="Verification dashboard"
        tone="admin"
      >
        Trust, moderation, and sensitive document decisions require audited admin action.
      </PageTitle>
      <section className="grid three">
        {adminSections.map((section) => (
          <Link className="card stack" href={section.href} key={section.href}>
            <span
              className="mode-card-icon"
              style={{ background: "var(--surface-muted)", color: "var(--ink-strong)" }}
            >
              <Icon name={section.icon} size={20} />
            </span>
            <div>
              <p className="eyebrow">{section.title}</p>
              <h3 style={{ fontSize: 18, marginTop: 6 }}>{section.description}</h3>
            </div>
            <div className="actions inline">
              <span className="link-button">
                Open
                <Icon name="arrow-right" size={13} />
              </span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
