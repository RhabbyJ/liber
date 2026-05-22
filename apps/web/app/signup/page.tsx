import Link from "next/link";
import { PageTitle } from "../../components/page-title";
import { safeInternalPath } from "../../lib/redirect";
import { signupWithPassword } from "../../server/auth-actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; role?: string }>;
}) {
  const { next = "", role = "buyer" } = await searchParams;
  const safeNext = safeInternalPath(next, "");
  const selectedRole = normalizeRole(role);
  const context = signupContext(selectedRole);

  return (
    <div className="page narrow">
      <PageTitle eyebrow="Account" title={context.title}>
        {context.description}
      </PageTitle>
      <section className="card stack">
        <div className="auth-alert info">
          <strong>Use a reachable email</strong>
          <span>If confirmation is required, Liber will send a verification link before your account can continue.</span>
        </div>
        <form action={signupWithPassword} className="form-grid">
          <input name="next" type="hidden" value={safeNext} />
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" placeholder="Full name" required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" placeholder="you@example.com" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required />
          </div>
          <div className="field">
            <label htmlFor="role">Starting role</label>
            <select defaultValue={selectedRole} id="role" name="role">
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
              <option value="both">Buyer and seller</option>
            </select>
          </div>
          <button className="button" type="submit">Continue</button>
        </form>
        <p className="muted">
          Already have an account? <Link href={safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : "/login"}>Log in</Link>.
        </p>
      </section>
    </div>
  );
}

function normalizeRole(role: string) {
  const value = role.toLowerCase();
  if (value === "seller" || value === "both") return value;
  return "buyer";
}

function signupContext(role: "buyer" | "seller" | "both") {
  if (role === "seller") {
    return {
      description: "Create a seller account to search buyer demand, save properties, and send invites.",
      title: "Sign up as a seller",
    };
  }

  if (role === "both") {
    return {
      description: "Create one account for both buyer profile tools and seller search workflows.",
      title: "Sign up as buyer and seller",
    };
  }

  return {
    description: "Create a buyer account to publish your demand profile, criteria, and verification documents.",
    title: "Sign up as a buyer",
  };
}
