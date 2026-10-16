import type { Metadata } from "next";
import { publicNameForDisplay } from "../../server/public-identity";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GeneratedAvatar } from "../../components/generated-avatar";
import { Icon } from "../../components/icon";
import { PageTitle } from "../../components/page-title";
import { ChangePasswordForm } from "../../components/password-forms";
import { getSessionUser } from "../../server/session";

export const metadata: Metadata = {
  title: "Your profile",
};

export default async function AccountProfilePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fprofile");
  const { status = "" } = await searchParams;

  const workspaces = [
    user.roles.includes("BUYER") ? { href: "/buyer/profile", label: "Buyer profile" } : null,
    user.roles.includes("SELLER") ? { href: "/seller/properties", label: "Seller workspace" } : null,
    user.roles.includes("ADMIN") ? { href: "/admin", label: "Admin workspace" } : null,
  ].filter((workspace): workspace is { href: string; label: string } => Boolean(workspace));

  return (
    <div className="page narrow stack loose">
      <PageTitle title="Your profile">
        Others see your first name, last initial, account code, and initials avatar.
      </PageTitle>

      <section className="account-identity" aria-label="Account">
        <GeneratedAvatar
          decorative
          name={publicNameForDisplay(user.name, user.id)}
          seed={user.id}
          size="lg"
          variant={user.avatarVariant}
        />
        <div>
          <h2>{publicNameForDisplay(user.name, user.id)}</h2>
          <p>{user.email}</p>
          <small>Only you can see your email and full surname.</small>
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

      <section aria-labelledby="password-heading" className="settings-section" id="password">
        <h2 id="password-heading">Password</h2>
        <ChangePasswordForm email={user.email ?? ""} status={status} />
      </section>
    </div>
  );
}
