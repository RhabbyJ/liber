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
      <PageTitle eyebrow="Account" title="Your profile">
        These account details are private. Buyer-facing identity uses your generated alias and avatar.
      </PageTitle>

      <section className="account-profile-card">
        <GeneratedAvatar
          alt="Your account avatar"
          seed={user.id}
          size="lg"
          variant={user.avatarVariant}
        />
        <div className="account-profile-identity">
          <h2>{user.name || "Liber member"}</h2>
          <p>{user.email}</p>
        </div>
        {workspaces.length > 0 ? (
          <div className="account-profile-links" aria-label="Your workspaces">
            {workspaces.map((workspace) => (
              <Link href={workspace.href} key={workspace.href}>
                {workspace.label}
                <Icon name="arrow-right" size={13} />
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
