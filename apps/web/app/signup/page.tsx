import Link from "next/link";
import { Icon } from "../../components/icon";
import { ModeChip } from "../../components/mode-chip";
import { PageTitle } from "../../components/page-title";
import { safeInternalPath } from "../../lib/redirect";
import { signupWithPassword } from "../../server/auth-actions";

const roleOptions: Array<{ value: "buyer" | "seller" | "both"; label: string; description: string }> = [
  { value: "buyer", label: "Buyer", description: "Publish a searchable demand profile." },
  { value: "seller", label: "Seller", description: "Search the buyer directory and send invites." },
  { value: "both", label: "Both", description: "Run buyer and seller flows from one account." },
];

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
    <div className="page narrow stack loose">
      <PageTitle
        eyebrow="Create your account"
        title={context.title}
        tone={selectedRole === "seller" ? "seller" : "buyer"}
        badge={<ModeChip mode={selectedRole === "seller" ? "seller" : "buyer"} />}
      >
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
          <div className="field full">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required />
            <span className="field-hint">Use 12+ characters with a mix of letters and numbers.</span>
          </div>
          <div className="field full">
            <label htmlFor="role">Starting role</label>
            <select defaultValue={selectedRole} id="role" name="role">
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} — {option.description}
                </option>
              ))}
            </select>
            <span className="field-hint">You can add the other role later from Account.</span>
          </div>
          <button className="button primary block" type="submit">
            <Icon name="arrow-right" size={15} />
            Create account
          </button>
        </form>
        <div className="divider" />
        <p className="muted small">
          Already have an account? <Link href={safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : "/login"}>Log in</Link>.
        </p>
      </section>
    </div>
  );
}

function normalizeRole(role: string): "buyer" | "seller" | "both" {
  const value = role.toLowerCase();
  if (value === "seller" || value === "both") return value;
  return "buyer";
}

function signupContext(role: "buyer" | "seller" | "both") {
  if (role === "seller") {
    return {
      description: "Create a seller account to search the buyer directory, manage private properties, and send manual invites.",
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
    description: "Create a buyer account to publish your demand profile, criteria, and verified trust badges.",
    title: "Sign up as a buyer",
  };
}
