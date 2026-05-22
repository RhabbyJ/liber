import { PageTitle } from "../../../components/page-title";
import { safeInternalPath } from "../../../lib/redirect";
import { chooseRole } from "../../../server/auth-actions";
import { getSessionUser } from "../../../server/session";
import { redirect } from "next/navigation";

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

  return (
    <div className="page">
      <PageTitle eyebrow="Onboarding" title={context.title}>
        {context.description}
      </PageTitle>
      <section className="grid three">
        <article className="card stack">
          <p className="eyebrow">Buyer</p>
          <h2>Create demand</h2>
          <p className="muted">Publish a searchable profile, criteria, badges, and invite inbox.</p>
          <form action={chooseRole}>
            <input name="next" type="hidden" value={safeNext} />
            <input name="role" type="hidden" value="buyer" />
            <button className="button" type="submit">Continue as buyer</button>
          </form>
        </article>
        <article className="card stack">
          <p className="eyebrow">Seller</p>
          <h2>Search demand</h2>
          <p className="muted">Find buyer profiles, add property context, and send manual invites.</p>
          <form action={chooseRole}>
            <input name="next" type="hidden" value={safeNext} />
            <input name="role" type="hidden" value="seller" />
            <button className="button" type="submit">Continue as seller</button>
          </form>
        </article>
        <article className="card stack">
          <p className="eyebrow">Both</p>
          <h2>Use both sides</h2>
          <p className="muted">Manage a buyer profile and seller property flow from one account.</p>
          <form action={chooseRole}>
            <input name="next" type="hidden" value={safeNext} />
            <input name="role" type="hidden" value="both" />
            <button className="button" type="submit">Continue with both</button>
          </form>
        </article>
      </section>
    </div>
  );
}

function roleContext(next: string) {
  if (next.startsWith("/seller")) {
    return {
      description: "Add seller access to search buyers, manage properties, and send invites.",
      title: "Add seller access",
    };
  }

  if (next.startsWith("/buyer")) {
    return {
      description: "Add buyer access to manage your profile, criteria, verification, and invites.",
      title: "Add buyer access",
    };
  }

  return {
    description: "Roles are stored server-side. Admin access is never self-assigned.",
    title: "Choose your role",
  };
}
