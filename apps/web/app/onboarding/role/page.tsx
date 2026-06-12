import { redirect } from "next/navigation";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { safeInternalPath } from "../../../lib/redirect";
import { chooseRole } from "../../../server/auth-actions";
import { defaultPathForSessionUser, getSessionUser } from "../../../server/session";

export default async function RoleOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = "" } = await searchParams;
  const safeNext = safeInternalPath(next, "");
  const user = await getSessionUser();
  const context = roleContext(safeNext);

  if (!user) redirect(`/login?next=${encodeURIComponent("/onboarding/role")}`);
  if (user.roles.length > 0 && (!safeNext || userCanContinueTo(user.roles, safeNext))) {
    redirect(safeNext || defaultPathForSessionUser(user));
  }

  return (
    <div className="page stack loose">
      <PageTitle eyebrow="Onboarding" title={context.title}>
        {context.description}
      </PageTitle>
      <section className="mode-picker">
        <article className="mode-card">
          <span className="mode-card-icon">
            <Icon name="user" size={22} />
          </span>
          <div>
            <p className="eyebrow">Buyer</p>
            <h2 style={{ marginTop: 6 }}>Create demand</h2>
          </div>
          <p className="muted">
            Publish a searchable profile with home-fit preferences and trust badges. Receive invites from sellers whose property fits your needs.
          </p>
          <form action={chooseRole}>
            <input name="next" type="hidden" value={safeNext} />
            <input name="role" type="hidden" value="buyer" />
            <button className="button primary block" type="submit">
              Continue as buyer
              <Icon name="arrow-right" size={14} />
            </button>
          </form>
        </article>
        <article className="mode-card seller">
          <span className="mode-card-icon">
            <Icon name="search" size={22} />
          </span>
          <div>
            <p className="eyebrow seller">Seller</p>
            <h2 style={{ marginTop: 6 }}>Search demand</h2>
          </div>
          <p className="muted">
            Find buyer profiles, add private property context, and send manual invites. Liber requires admin approval before seller access.
          </p>
          <form action={chooseRole}>
            <input name="next" type="hidden" value={safeNext} />
            <input name="role" type="hidden" value="seller" />
            <button className="button block" type="submit">
              Continue as seller
              <Icon name="arrow-right" size={14} />
            </button>
          </form>
        </article>
      </section>

      <section className="card flat" style={{ background: "var(--surface-muted)", borderStyle: "dashed" }}>
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Both sides</p>
            <h3>Use Liber as a buyer and a seller</h3>
          </div>
          <form action={chooseRole}>
            <input name="next" type="hidden" value={safeNext} />
            <input name="role" type="hidden" value="both" />
            <button className="button secondary" type="submit">
              Enable both roles
              <Icon name="arrow-right" size={14} />
            </button>
          </form>
        </div>
        <p className="muted">
          One account, two flows. Switch contexts anytime from the top navigation.
        </p>
      </section>
    </div>
  );
}

function userCanContinueTo(roles: string[], next: string) {
  if (next.startsWith("/buyer") || next.startsWith("/buyers")) return roles.includes("BUYER");
  if (next.startsWith("/seller")) return roles.includes("SELLER");
  if (next.startsWith("/admin")) return roles.includes("ADMIN");
  return false;
}

function roleContext(next: string) {
  if (next.startsWith("/seller")) {
    return {
      description: "Add seller access to search the buyer directory, manage private properties, and send manual invites.",
      title: "Add seller access",
    };
  }

  if (next.startsWith("/buyer")) {
    return {
      description: "Add buyer access to publish your profile, verification, and invite inbox.",
      title: "Add buyer access",
    };
  }

  return {
    description: "Roles are stored server-side. Admin access is never self-assigned.",
    title: "Choose how you'll use Liber",
  };
}
