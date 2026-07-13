import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { listSellerInvites } from "../../../server/contracts";

const statusTone: Record<string, "active" | "info" | "warning" | "danger" | ""> = {
  Sent: "info",
  Viewed: "info",
  Accepted: "active",
  Declined: "danger",
  Expired: "warning",
};

export default async function SellerInvitesPage() {
  const { data: invites } = await listSellerInvites();

  return (
    <div className="page wide stack loose">
      <PageTitle
        eyebrow="Outreach log"
        title="Sent invites"
        tone="seller"
        actions={
          <Link className="button ghost" href="/seller/notifications">
            <Icon name="bell" size={14} />
            Notifications
          </Link>
        }
      >
        Track invite status without offer automation. Liber respects rate limits and never auto-resends.
      </PageTitle>

      {invites.length === 0 ? (
        <EmptyState
          icon="mail"
          visual="invites"
          title="No invites sent yet"
          description="Search buyers and send a manual invite once you find a fit."
          actions={
            <Link className="button primary" href="/seller/search">
              <Icon name="search" size={14} />
              Find buyers
            </Link>
          }
        />
      ) : (
        <section className="card flat">
          <table className="table">
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Property</th>
                <th>Ownership</th>
                <th>Title</th>
                <th>Status</th>
                <th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => {
                const verified = invite.propertyStatus === "Ownership verified";
                const tone = statusTone[invite.status] || "";
                return (
                  <tr key={invite.id}>
                    <td><strong>{invite.buyer}</strong></td>
                    <td>{invite.property}</td>
                    <td>
                      <span className={`status-dot ${verified ? "active" : ""}`}>
                        {invite.propertyStatus || "Ownership not submitted"}
                      </span>
                    </td>
                    <td>{invite.title}</td>
                    <td><span className={`status-dot ${tone}`}>{invite.status}</span></td>
                    <td className="muted small">{invite.sentAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
