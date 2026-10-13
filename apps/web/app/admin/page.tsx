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
    <div className="page narrow stack loose">
      <PageTitle title="Admin" />
      <nav aria-label="Admin sections" className="settings-list">
        {adminSections.map((section) => (
          <Link className="settings-row" href={section.href} key={section.href}>
            <span className="settings-row-icon" aria-hidden="true">
              <Icon name={section.icon} size={20} />
            </span>
            <span className="settings-row-text">
              <strong>{section.title}</strong>
              <small>{section.description}</small>
            </span>
            <Icon className="settings-row-chevron" name="chevron-right" size={20} />
          </Link>
        ))}
      </nav>
    </div>
  );
}
