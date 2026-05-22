import { PageTitle } from "../../../components/page-title";
import { listAdminInvites } from "../../../server/contracts";

export default async function AdminInvitesPage() {
  const { data: invites } = await listAdminInvites();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Invites" />
      <section className="card flat">
        <table className="table">
          <thead>
            <tr>
              <th>Buyer</th>
              <th>Property</th>
              <th>Status</th>
              <th>Moderation</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.id}>
                <td>{invite.buyer}</td>
                <td>{invite.property}</td>
                <td>{invite.status}</td>
                <td><button className="button secondary" type="button">Review abuse</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
