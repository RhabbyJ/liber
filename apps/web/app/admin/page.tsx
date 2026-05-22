import Link from "next/link";
import { PageTitle } from "../../components/page-title";

const adminSections = [
  ["Users", "/admin/users", "Roles, suspensions, and profile ownership."],
  ["Buyer profiles", "/admin/buyer-profiles", "Visibility, suspicious profiles, and moderation."],
  ["Badges", "/admin/badges", "Manual grant, revoke, and expiration review."],
  ["Documents", "/admin/documents", "Private ownership and verification files."],
  ["Invites", "/admin/invites", "Abuse review and status tracking."],
  ["Reports", "/admin/reports", "Moderation queue for suspicious activity."],
  ["Audit log", "/admin/audit-log", "Sensitive admin action history."],
];

export default function AdminDashboardPage() {
  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Verification dashboard">
        Trust, moderation, and sensitive document decisions require audited admin action.
      </PageTitle>
      <section className="grid three">
        {adminSections.map(([title, href, description]) => (
          <Link className="card nav-card" href={href} key={href}>
            <p className="eyebrow">{title}</p>
            <p className="muted">{description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
