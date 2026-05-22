import Link from "next/link";
import { PageTitle } from "../../../components/page-title";
import { respondToBuyerInvite } from "../../../server/form-actions";
import { listBuyerInvites } from "../../../server/contracts";

export default async function BuyerInvitesPage() {
  const { data: invites } = await listBuyerInvites();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Buyer" title="Invites">
        Buyers can accept or decline invite outreach without triggering automated transaction execution.
      </PageTitle>
      <section className="card flat">
        <table className="table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Ownership</th>
              <th>Seller message</th>
              <th>Status</th>
              <th>Response</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.id}>
                <td>{invite.property}</td>
                <td>
                  <span className={invite.propertyStatus?.toLowerCase().includes("verified") ? "status-dot active" : "status-dot"}>
                    {invite.propertyStatus || "Ownership not submitted"}
                  </span>
                </td>
                <td>
                  <strong>{invite.title}</strong>
                  <p className="muted">{invite.message}</p>
                </td>
                <td>{invite.status}</td>
                <td>
                  <div className="actions inline">
                    <form action={respondToBuyerInvite}>
                      <input name="inviteId" type="hidden" value={invite.id} />
                      <input name="response" type="hidden" value="ACCEPTED" />
                      <button className="button" type="submit">Accept</button>
                    </form>
                    <form action={respondToBuyerInvite}>
                      <input name="inviteId" type="hidden" value={invite.id} />
                      <input name="response" type="hidden" value="DECLINED" />
                      <button className="button secondary" type="submit">Decline</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Link className="button secondary self-start" href="/buyer/notifications">View notifications</Link>
    </div>
  );
}
