import Link from "next/link";
import { Icon } from "../components/icon";

export default function HomePage() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-inner">
          <div className="hero-copy">
            <span className="mode-chip" style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--ink-soft)" }}>
              <Icon name="sparkle" size={12} />
              Reverse real estate marketplace
            </span>
            <h1>
              Meet <strong>the buyer</strong> before you list.
            </h1>
            <p className="hero-lede">
              Liber is a private buyer directory. Buyers create verified demand profiles. Sellers search by criteria
              and send manual invites — never offers, escrow, or automated transactions.
            </p>
            <div className="hero-actions">
              <Link className="button primary lg" href="/signup?role=seller&next=/seller/search">
                <Icon name="search" size={16} />
                Find buyers for my property
              </Link>
              <Link className="button secondary lg" href="/signup?role=buyer&next=/buyer/profile">
                <Icon name="user" size={16} />
                Create a buyer profile
              </Link>
            </div>
            <div className="hero-trust">
              <span><span className="dot" /> Verified pre-approval</span>
              <span><span className="dot" /> Admin-reviewed trust</span>
              <span><span className="dot" /> Private properties</span>
              <span><span className="dot" /> Manual outreach only</span>
            </div>
          </div>

          <HeroArtwork />
        </div>
      </section>

      <section className="content-band" style={{ paddingTop: 0 }}>
        <div className="section-stack" style={{ marginBottom: 40 }}>
          <p className="section-kicker">How it works</p>
          <h2 className="section-title">A calmer flow for the people who matter most.</h2>
          <p className="section-sub">
            Two clear paths. No noise. No public listings. Everything stays private until both sides agree to talk.
          </p>
        </div>

        <div className="grid two">
          <FlowCard
            tone="buyer"
            icon="user"
            title="For Buyers"
            subtitle="Get found by serious sellers"
            steps={[
              "Build a buyer profile with budget, criteria, and intent.",
              "Earn admin-reviewed trust badges (pre-approval, cash buyer, identity).",
              "Receive invites from sellers whose property fits — review and respond on your terms.",
            ]}
            cta={{ href: "/signup?role=buyer&next=/buyer/profile", label: "Create a buyer profile" }}
          />
          <FlowCard
            tone="seller"
            icon="search"
            title="For Sellers"
            subtitle="Search demand before you list"
            steps={[
              "Browse the buyer directory on a map filtered by area, budget, and trust badges.",
              "Open a buyer profile to see needs, wants, and verified status.",
              "Add private property context and send a manual invite. Your property is only shared with the buyers you choose.",
            ]}
            cta={{ href: "/signup?role=seller&next=/seller/search", label: "Find serious buyers" }}
          />
        </div>
      </section>

      <section className="content-band tight">
        <div className="card ink">
          <div className="grid two" style={{ alignItems: "center" }}>
            <div className="stack">
              <p className="eyebrow">Why Liber</p>
              <h2 style={{ color: "#fff" }}>
                Premium-grade trust, without the broker-y noise.
              </h2>
              <p>
                Liber is built around real demand. Every buyer profile is owned by the buyer, every trust badge is admin-reviewed,
                and every seller-to-buyer outreach is manual. No automated offers, no money custody, no public listings of your home.
              </p>
              <div className="actions">
                <Link className="button" href="/signup">
                  Get started
                  <Icon name="arrow-right" size={14} />
                </Link>
                <Link className="button secondary" href="/seller/search">
                  <Icon name="eye" size={14} />
                  Preview seller view
                </Link>
              </div>
            </div>
            <div className="grid two" style={{ gap: 14 }}>
              <ValueTile icon="check-shield" label="Verified pre-approval" body="Pre-approval badges expire after 90 days and require admin review." />
              <ValueTile icon="lock" label="Private outreach" body="Seller properties and ownership documents stay private until invited." />
              <ValueTile icon="map-pin" label="Geo-aware demand" body="PostGIS-powered radius search by pilot area or ZIP." />
              <ValueTile icon="message" label="No automated offers" body="Invites are manual messages, not contracts or escrow events." />
            </div>
          </div>
        </div>
      </section>

      <section className="content-band">
        <div className="section-stack" style={{ marginBottom: 36 }}>
          <p className="section-kicker">Three steps</p>
          <h2 className="section-title">From demand to a direct conversation.</h2>
        </div>
        <div className="steps">
          <article className="step">
            <p className="eyebrow">For buyers</p>
            <h3>Publish your demand profile</h3>
            <p>Set your area, budget, beds/baths, and the type of home you'd say yes to. Liber turns your story into a profile.</p>
          </article>
          <article className="step">
            <p className="eyebrow seller">For sellers</p>
            <h3>Search the buyer directory</h3>
            <p>Filter by pilot area, budget ceiling, and active trust badges. Open profiles that look like a fit.</p>
          </article>
          <article className="step">
            <p className="eyebrow">Together</p>
            <h3>Send a manual invite</h3>
            <p>Add private property details and write a short message. The buyer chooses whether to take the next step.</p>
          </article>
        </div>
      </section>

      <section className="content-band tight">
        <div className="card raised" style={{ alignItems: "center", display: "grid", gap: 22, gridTemplateColumns: "minmax(0, 1.4fr) auto", padding: 32 }}>
          <div className="stack" style={{ gap: 8 }}>
            <p className="eyebrow">Buyer-first marketplace</p>
            <h2 style={{ fontSize: 28 }}>Ready to be the buyer that sellers reach out to?</h2>
            <p className="muted">Build a profile in under five minutes. You decide when (and to whom) it goes live.</p>
          </div>
          <div className="actions" style={{ marginTop: 0 }}>
            <Link className="button primary lg" href="/signup?role=buyer&next=/buyer/profile">
              <Icon name="sparkle" size={16} />
              Create a buyer profile
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeroArtwork() {
  return (
    <div aria-hidden="true" className="hero-art">
      <span className="hero-art-pin a">JP</span>
      <span className="hero-art-pin amber b">MR</span>
      <span className="hero-art-pin c">AK</span>
      <div className="hero-art-card one">
        <span className="stat-label">Active buyers</span>
        <span className="stat-value">142</span>
        <span className="muted small">In the San Fernando Valley pilot</span>
      </div>
      <div className="hero-art-card two">
        <span className="stat-label">Top buyer</span>
        <span className="stat-value">Julie P. · Northridge</span>
        <span className="muted small">Pre-approved · Up to $960k</span>
      </div>
      <div className="hero-art-card three">
        <span className="stat-label">Verified trust</span>
        <span className="stat-value">94%</span>
        <span className="muted small">Active pre-approval or cash status</span>
      </div>
    </div>
  );
}

type FlowCardProps = {
  tone: "buyer" | "seller";
  icon: "user" | "search";
  title: string;
  subtitle: string;
  steps: string[];
  cta: { href: string; label: string };
};

function FlowCard({ tone, icon, title, subtitle, steps, cta }: FlowCardProps) {
  return (
    <article className={`mode-card ${tone}`}>
      <span className="mode-card-icon">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p className={`eyebrow${tone === "seller" ? " seller" : ""}`}>{title}</p>
        <h3 style={{ marginTop: 8 }}>{subtitle}</h3>
      </div>
      <ul className="clean-list">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      <div>
        <Link className={`button ${tone === "buyer" ? "primary" : ""}`} href={cta.href}>
          {cta.label}
          <Icon name="arrow-right" size={14} />
        </Link>
      </div>
    </article>
  );
}

function ValueTile({ icon, label, body }: { icon: "check-shield" | "lock" | "map-pin" | "message"; label: string; body: string }) {
  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: "var(--r-md)",
        display: "grid",
        gap: 8,
        padding: 16,
      }}
    >
      <span
        style={{
          alignItems: "center",
          background: "rgba(247, 237, 212, 0.16)",
          borderRadius: "var(--r-pill)",
          color: "var(--amber-tint)",
          display: "inline-flex",
          height: 32,
          justifyContent: "center",
          width: 32,
        }}
      >
        <Icon name={icon} size={16} />
      </span>
      <strong style={{ color: "#fff", fontSize: 14 }}>{label}</strong>
      <span style={{ color: "rgba(247, 242, 230, 0.78)", fontSize: 13 }}>{body}</span>
    </div>
  );
}
