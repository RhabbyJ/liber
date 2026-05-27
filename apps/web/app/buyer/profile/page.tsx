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

export default async function BuyerProfileBuilderPage() {
  const [{ data: buyer }, { data: invites }] = await Promise.all([
    getCurrentBuyerProfile(),
    listBuyerInvites(),
  ]);
  const isActive = buyer.visibility === "active";
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const pendingInvites = invites.filter((invite) => invite.status === "Sent" || invite.status === "Viewed");

  return (
    <div className="page wide stack loose">
      <PageTitle
        eyebrow="Buyer hub"
        title={isActive ? `Welcome back, ${buyer.name || "buyer"}.` : "Build your buyer profile"}
        tone="buyer"
        badge={<ModeChip mode="buyer" />}
        actions={
          <span className={`status-dot ${isActive ? "active" : "warning"}`}>
            {isActive ? "Live to sellers" : "Draft — not yet visible"}
          </span>
        }
      >
        Profile, invites, verification, and your account — all in one place. Walk through the steps below to keep your profile fresh.
      </PageTitle>

      <section className="grid sidebar">
        <div className="card stack loose wizard-card">
          <BuyerProfileWizard action={submitBuyerProfile} buyer={buyer} />
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

          <article className="card stack verification-card">
            <div className="section-head compact">
              <div>
                <p className="eyebrow">Verification</p>
                <h2 style={{ fontSize: 20 }}>Get a trust badge</h2>
              </div>
              <span className="status-dot info">
                <Icon name="lock" size={12} />
                Private
              </span>
            </div>
            <p className="muted small">Upload a pre-approval or proof of funds. Liber reviews it; sellers only see the badge.</p>
            <form action={submitBuyerVerificationDocument} className="form-grid" encType="multipart/form-data">
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
                  Submit
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
          <p className="muted small">Profile, invites, search criteria, and verification all live here. Nothing else to manage.</p>
          <div className="actions inline">
            <Link className="button secondary" href="/buyer/criteria">
              <Icon name="list" size={14} />
              Edit search criteria
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
