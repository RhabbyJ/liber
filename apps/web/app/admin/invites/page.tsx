import { AdminReasonAction } from "../../../components/admin-reason-action";
import { PageTitle } from "../../../components/page-title";
import { isOpenInvite } from "../../../lib/invite-status";
import { listAdminInvites } from "../../../server/contracts";
import { submitAdminInviteWithdrawal } from "../../../server/form-actions";

export default async function AdminInvitesPage() {
  const { data: invites } = await listAdminInvites();

  return (
    <div className="page stack">
      <PageTitle title="Invites">Withdraw an open invite that breaks Liber’s outreach rules. Both participants are notified.</PageTitle>
      <section className="card flat">
        <table className="table">
          <thead>
            <tr>
              <th>Buyer</th>
              <th>Property</th>
              <th>Sent</th>
              <th>Status</th>
              <th>Moderation</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.id}>
                <td>{invite.buyer}</td>
                <td>{invite.property}</td>
                <td>{invite.sentAtDate}</td>
                <td>{invite.status}</td>
                <td>
                  {isOpenInvite(invite.status) ? (
                    <AdminReasonAction
                      action={submitAdminInviteWithdrawal}
                      confirmLabel="Withdraw invite"
                      fields={{ inviteId: invite.id }}
                      label="Withdraw"
                      pendingLabel="Withdrawing…"
                      prompt="The conversation becomes read-only. This can’t be undone."
                      reasonLabel="Reason (audit log only)"
                      tone="warning"
                    />
                  ) : <span className="muted">Closed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
