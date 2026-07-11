import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { ModeChip } from "../../../components/mode-chip";
import { PageTitle } from "../../../components/page-title";
import { PrivatePropertyImages } from "../../../components/private-property-images";
import { listBuyerInvites } from "../../../server/contracts";
import { respondToBuyerInvite } from "../../../server/form-actions";

export default async function BuyerInvitesPage() {
  const { data: invites } = await listBuyerInvites();

  return (
    <div className="page stack loose">
      <PageTitle
        eyebrow="Invite inbox"
        title="Property invites from sellers"
        tone="buyer"
        badge={<ModeChip mode="buyer" />}
        actions={
          <Link className="button ghost" href="/buyer/notifications">
            <Icon name="bell" size={14} />
            Notifications
          </Link>
        }
      >
        Accept or decline outreach on your terms. Liber never triggers offers, payments, or escrow on your behalf.
      </PageTitle>

      {invites.length === 0 ? (
        <EmptyState
          icon="mail"
          title="No invites yet"
          description="Sellers will reach out as your profile matches their property. Add verification badges to stand out faster."
          actions={
            <Link className="button" href="/buyer/badges">
              <Icon name="shield" size={14} />
              Get verified
            </Link>
          }
        />
      ) : (
        <div className="grid two">
          {invites.map((invite) => {
            const verified = invite.propertyStatus === "Ownership verified";
            return (
              <article className="card stack" key={invite.id}>
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">{invite.property}</p>
                    <h2 style={{ fontSize: 20, marginTop: 6 }}>{invite.title}</h2>
                  </div>
                  <span className={`status-dot ${verified ? "active" : "warning"}`}>
                    <Icon name={verified ? "check-shield" : "info"} size={12} />
                    {invite.propertyStatus || "Ownership not submitted"}
                  </span>
                </div>
                <p className="muted">{invite.message}</p>
                <PrivatePropertyImages imageIds={invite.imageIds ?? []} />
                <div className="actions between">
                  <span className="status-dot">
                    <Icon name="calendar" size={12} />
                    {invite.status}
                  </span>
                  <div className="actions inline">
                    <form action={respondToBuyerInvite}>
                      <input name="inviteId" type="hidden" value={invite.id} />
                      <input name="response" type="hidden" value="DECLINED" />
                      <button className="button ghost" type="submit">
                        Decline
                      </button>
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
    </div>
  );
}
