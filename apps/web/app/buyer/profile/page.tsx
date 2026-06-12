import Link from "next/link";
import { Avatar } from "../../../components/avatar";
import { BadgePill } from "../../../components/badge-pill";
import { BuyerProfileWizard } from "../../../components/buyer-profile-wizard";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { ModeChip } from "../../../components/mode-chip";
import { PageTitle } from "../../../components/page-title";
import { formatRange } from "../../../lib/format";
import { getCurrentBuyerProfile, listBuyerInvites } from "../../../server/contracts";
import {
  respondToBuyerInvite,
  submitBuyerProfile,
  submitBuyerVerificationDocument,
} from "../../../server/form-actions";

export default async function BuyerProfileBuilderPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string; verification?: string }>;
}) {
  const { edit = "", verification = "" } = searchParams ? await searchParams : {};
  const [{ data: buyer }, { data: invites }] = await Promise.all([
    getCurrentBuyerProfile(),
    listBuyerInvites(),
  ]);
  const isActive = buyer.visibility === "active";
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const hasPreApproval = activeBadges.some((badge) => badge.type === "PRE_APPROVED");
  const hasPendingPreApproval = buyer.badges.some((badge) => badge.type === "PRE_APPROVED" && badge.status === "pending");
  const pendingInvites = invites.filter((invite) => invite.status === "Sent" || invite.status === "Viewed");
  const showProfileWizard = !isActive || edit === "profile";
  const verificationCard = (
    <article className={`card stack verification-card ${!showProfileWizard && !hasPreApproval ? "priority" : ""}`}>
      <div className="section-head compact">
        <div>
          <p className="eyebrow">Verification</p>
          <h2 style={{ fontSize: showProfileWizard ? 20 : 26 }}>
            {hasPreApproval ? "Verification is active" : "Get pre-approved"}
          </h2>
        </div>
        <span className={`status-dot ${hasPreApproval ? "active" : hasPendingPreApproval ? "warning" : "info"}`}>
          <Icon name={hasPreApproval ? "check-shield" : "lock"} size={12} />
          {hasPreApproval ? "Active" : hasPendingPreApproval ? "In review" : "Private"}
        </span>
      </div>
      <p className="muted small">
        {hasPreApproval
          ? "Your pre-approval badge is active. Upload refreshed evidence before it expires."
          : hasPendingPreApproval
            ? "Your pre-approval evidence is under review. You can upload updated proof of funds if anything changed."
            : "Upload a pre-approval letter or proof of funds. Liber reviews it; sellers only see the approved badge."}
      </p>
      <form action={submitBuyerVerificationDocument} className="form-grid" encType="multipart/form-data">
        {verification === "missing" ? (
          <div className="auth-alert info field full">
            <strong>Add a file first</strong>
            <span>Choose your pre-approval letter or proof of funds before submitting for review.</span>
          </div>
        ) : null}
        {verification === "submitted" ? (
          <div className="auth-alert success field full">
            <strong>Submitted for review</strong>
            <span>Your document is private. Sellers will only see an approved badge.</span>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="documentType">Type</label>
          <select id="documentType" name="documentType">
            <option value="PRE_APPROVAL">Pre-approval letter</option>
            <option value="VERIFIED_FUNDS">Proof of funds</option>
            <option value="IDENTITY">Identity</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="document">File</label>
          <input id="document" name="document" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
          <span className="field-hint">PDF, PNG, JPEG, WebP - 25 MB max</span>
        </div>
        <div className="field full">
          <button className="button primary" type="submit">
            <Icon name="upload" size={14} />
            Submit for review
          </button>
        </div>
      </form>
      {buyer.badges.length > 0 ? (
        <div className="pill-row">
          {buyer.badges.map((badge) => (
            <BadgePill badge={badge} key={badge.label} />
          ))}
        </div>
      ) : null}
    </article>
  );

  return (
    <div className="page wide stack loose">
      <PageTitle
        eyebrow="Buyer hub"
        title={isActive ? `Welcome back, ${buyer.name || "buyer"}.` : "Build your buyer profile"}
        tone="buyer"
        badge={<ModeChip mode="buyer" />}
        actions={
          <span className={`status-dot ${isActive ? "active" : "warning"}`}>
            {isActive ? "Live to sellers" : "Draft - not yet visible"}
          </span>
        }
      >
        {isActive
          ? "Your profile is live. The next priority is verification, then invites."
          : "Complete the steps below — profile, budget, home fit, and story — to become visible to sellers."}
      </PageTitle>

      <section className="grid sidebar">
        <div className={showProfileWizard ? "card stack loose wizard-card" : "stack loose"}>
          {showProfileWizard ? (
            <BuyerProfileWizard action={submitBuyerProfile} buyer={buyer} />
          ) : (
            <>
              {verificationCard}
              <article className="card stack">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Profile complete</p>
                    <h2 style={{ fontSize: 22 }}>Your buyer profile is live</h2>
                  </div>
                  <span className="status-dot active">
                    <Icon name="check" size={12} />
                    Searchable
                  </span>
                </div>
                <p className="muted small">
                  Sellers can now find your profile when your location, budget, and home criteria match their private property.
                </p>
                <div className="summary-grid">
                  <div>
                    <span className="summary-label">Location</span>
                    <span className="summary-value">{buyer.location || "Not set"}</span>
                  </div>
                  <div>
                    <span className="summary-label">Budget</span>
                    <span className="summary-value">{formatRange(buyer.budgetMin, buyer.budgetMax)}</span>
                  </div>
                  <div>
                    <span className="summary-label">Buying for</span>
                    <span className="summary-value">{buyer.purpose || "Not set"}</span>
                  </div>
                </div>
                <div className="actions inline">
                  <Link className="button secondary" href="/buyer/profile?edit=profile">
                    <Icon name="list" size={14} />
                    Edit profile
                  </Link>
                </div>
              </article>
            </>
          )}
        </div>

        <aside className="public-profile-aside">
          <article className="card stack">
            <p className="eyebrow">Live preview</p>
            <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="profile-photo">
                <Avatar name={buyer.name} size="xl" src={buyer.avatarUrl} />
              </div>
              <div style={{ textAlign: "center" }}>
                <h2 style={{ fontSize: 22, margin: 0 }}>{buyer.name}</h2>
                <p className="muted small" style={{ marginTop: 4 }}>{buyer.location}</p>
              </div>
            </div>
            <div className="summary-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div>
                <span className="summary-label">Budget</span>
                <span className="summary-value">{formatRange(buyer.budgetMin, buyer.budgetMax)}</span>
              </div>
              <div>
                <span className="summary-label">Down payment</span>
                <span className="summary-value">{formatRange(buyer.downPaymentMin, buyer.downPaymentMax)}</span>
              </div>
              <div>
                <span className="summary-label">Buying for</span>
                <span className="summary-value">{buyer.purpose}</span>
              </div>
            </div>
            {activeBadges.length > 0 ? (
              <div className="pill-row">
                {activeBadges.map((badge) => (
                  <BadgePill badge={badge} key={badge.label} />
                ))}
              </div>
            ) : (
              <p className="muted small">No trust badges yet. Add one below to stand out.</p>
            )}
            {isActive && buyer.id !== "new-profile" ? (
              <Link className="button secondary" href={`/buyers/${buyer.id}`}>
                <Icon name="eye" size={14} />
                View as seller
              </Link>
            ) : (
              <p className="muted small">Finish the steps before sharing the seller-facing page.</p>
            )}
          </article>

          {showProfileWizard ? verificationCard : null}
        </aside>
      </section>

      <section className="stack">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Invites</p>
            <h2 style={{ fontSize: 22 }}>
              Outreach from sellers
              {pendingInvites.length > 0 ? (
                <span className="invite-count">{pendingInvites.length}</span>
              ) : null}
            </h2>
          </div>
          <Link className="button ghost" href="/buyer/notifications">
            <Icon name="bell" size={14} />
            Notifications
          </Link>
        </div>
        {invites.length === 0 ? (
          <EmptyState
            icon="mail"
            title="No invites yet"
            description="Sellers reach out as your profile matches their property. Verification badges help you stand out faster."
          />
        ) : (
          <div className="grid two">
            {invites.map((invite) => {
              const verified = invite.propertyStatus?.toLowerCase().includes("verified");
              return (
                <article className="card stack" key={invite.id}>
                  <div className="section-head compact">
                    <div>
                      <p className="eyebrow">{invite.property}</p>
                      <h3 style={{ fontSize: 18, marginTop: 6 }}>{invite.title}</h3>
                    </div>
                    <span className={`status-dot ${verified ? "active" : "warning"}`}>
                      <Icon name={verified ? "check-shield" : "info"} size={12} />
                      {invite.propertyStatus || "Ownership not submitted"}
                    </span>
                  </div>
                  <p className="muted small">{invite.message}</p>
                  <div className="actions between">
                    <span className="status-dot">
                      <Icon name="calendar" size={12} />
                      {invite.status}
                    </span>
                    <div className="actions inline">
                      <form action={respondToBuyerInvite}>
                        <input name="inviteId" type="hidden" value={invite.id} />
                        <input name="response" type="hidden" value="DECLINED" />
                        <button className="button ghost" type="submit">Decline</button>
                      </form>
                      <form action={respondToBuyerInvite}>
                        <input name="inviteId" type="hidden" value={invite.id} />
                        <input name="response" type="hidden" value="ACCEPTED" />
                        <button className="button primary" type="submit">
                          <Icon name="check" size={14} />
                          Accept
                        </button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="stack">
        <article className="card stack">
          <div className="section-head compact">
            <div>
              <p className="eyebrow">Account</p>
              <h2 style={{ fontSize: 20 }}>Signed in as {buyer.name || "buyer"}</h2>
            </div>
          </div>
          <p className="muted small">Profile, invites, and verification all live here. Setup stays tucked away once complete.</p>
          <div className="actions inline">
            <Link className="button secondary" href="/buyer/profile?edit=profile">
              <Icon name="list" size={14} />
              Edit profile
            </Link>
            <form action="/logout" method="post">
              <button className="button ghost" type="submit">
                <Icon name="logout" size={14} />
                Sign out
              </button>
            </form>
          </div>
        </article>
      </section>
    </div>
  );
}
