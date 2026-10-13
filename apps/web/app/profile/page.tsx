import Link from "next/link";
import { redirect } from "next/navigation";
import { GeneratedAvatar } from "../../components/generated-avatar";
import { Icon } from "../../components/icon";
import { PageTitle } from "../../components/page-title";
import { getSessionUser } from "../../server/session";

export default async function AccountProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fprofile");

  const workspaces = [
    user.roles.includes("BUYER") ? { href: "/buyer/profile", label: "Buyer profile" } : null,
    user.roles.includes("SELLER") ? { href: "/seller/search", label: "Seller workspace" } : null,
    user.roles.includes("ADMIN") ? { href: "/admin", label: "Admin workspace" } : null,
  ].filter((workspace): workspace is { href: string; label: string } => Boolean(workspace));

  return (
    <div className="page narrow stack loose">
      <PageTitle title="Your profile" />

      <section className="account-identity" aria-label="Account">
        <GeneratedAvatar
          alt="Your account avatar"
          name={user.name || user.email}
          seed={user.id}
          size="lg"
          variant={user.avatarVariant}
        />
        <div>
          <h2>{user.name || "Liber member"}</h2>
          <p>{user.email}</p>
          <small>Only you can see your name and email.</small>
        </div>
      </section>

      {workspaces.length > 0 ? (
        <nav aria-label="Your workspaces" className="settings-list">
          {workspaces.map((workspace) => (
            <Link className="settings-row" href={workspace.href} key={workspace.href}>
              <span className="settings-row-text">
                <strong>{workspace.label}</strong>
              </span>
              <Icon className="settings-row-chevron" name="chevron-right" size={20} />
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
