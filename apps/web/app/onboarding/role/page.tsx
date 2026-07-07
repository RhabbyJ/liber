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

  if (!user) redirect(`/login?next=${encodeURIComponent("/onboarding/role")}`);
  const context = roleContext(safeNext, user.roles);
  const isBuyerAddingSeller =
    user.roles.includes("BUYER") &&
    !user.roles.includes("SELLER") &&
    isPathSegment(safeNext, "/seller");
  const isSellerAddingBuyer =
    user.roles.includes("SELLER") &&
    !user.roles.includes("BUYER") &&
    isPathSegment(safeNext, "/buyer");
  const isRoleUpgrade = isBuyerAddingSeller || isSellerAddingBuyer;

  if (user.roles.length > 0 && (!safeNext || userCanContinueTo(user.roles, safeNext))) {
    redirect(safeNext || defaultPathForSessionUser(user));
  }

  return (
    <div className="page stack loose">
      <PageTitle eyebrow="Onboarding" title={context.title}>
        {context.description}
      </PageTitle>
      <section className="mode-picker">
        {!isBuyerAddingSeller ? (
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
                {isSellerAddingBuyer ? "Add buyer access" : "Continue as buyer"}
                <Icon name="arrow-right" size={14} />
              </button>
            </form>
          </article>
        ) : null}
        {!isSellerAddingBuyer ? (
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
              <button className={isBuyerAddingSeller ? "button primary block" : "button block"} type="submit">
                {isBuyerAddingSeller ? "Add seller access" : "Continue as seller"}
                <Icon name="arrow-right" size={14} />
              </button>
            </form>
          </article>
        ) : null}
      </section>

      {!isRoleUpgrade ? (
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
      ) : null}
    </div>
  );
}

function userCanContinueTo(roles: string[], next: string) {
  if (isPathSegment(next, "/buyers")) return roles.includes("BUYER") || roles.includes("SELLER") || roles.includes("ADMIN");
  if (isPathSegment(next, "/buyer")) return roles.includes("BUYER");
  if (isPathSegment(next, "/seller")) return roles.includes("SELLER");
  if (isPathSegment(next, "/admin")) return roles.includes("ADMIN");
  return false;
}

function roleContext(next: string, roles: string[]) {
  if (isPathSegment(next, "/seller")) {
    if (roles.includes("BUYER") && !roles.includes("SELLER")) {
      return {
        description: "Keep your buyer profile and add seller access to the same account. No second account or new password is needed.",
        title: "Add seller access to your buyer account",
      };
    }

    return {
      description: "Add seller access to search the buyer directory, manage private properties, and send manual invites.",
      title: "Add seller access",
    };
  }

  if (isPathSegment(next, "/buyer")) {
    if (roles.includes("SELLER") && !roles.includes("BUYER")) {
      return {
        description: "Keep your seller workspace and add buyer access to the same account. No second account or new password is needed.",
        title: "Add buyer access to your seller account",
      };
    }

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

function isPathSegment(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
