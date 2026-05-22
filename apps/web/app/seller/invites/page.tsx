import { PageTitle } from "../../../components/page-title";
import { listSellerInvites } from "../../../server/contracts";

export default async function SellerInvitesPage() {
  const { data: invites } = await listSellerInvites();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Seller" title="Sent invites">
        Sellers can track invite status without offer automation.
      </PageTitle>
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
            {invites.map((invite) => (
              <tr key={invite.id}>
                <td>{invite.buyer}</td>
                <td>{invite.property}</td>
                <td>
                  <span className={invite.propertyStatus?.toLowerCase().includes("verified") ? "status-dot active" : "status-dot"}>
                    {invite.propertyStatus || "Ownership not submitted"}
                  </span>
                </td>
                <td>{invite.title}</td>
                <td>{invite.status}</td>
                <td>{invite.sentAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
