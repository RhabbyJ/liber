import Link from "next/link";
import { PageTitle } from "../../../components/page-title";
import { SellerAccessReviewForm } from "../../../components/seller-access-review-form";
import { listUsers } from "../../../server/contracts";
import { submitSellerAccessReview, submitUserSuspension } from "../../../server/form-actions";

export default async function AdminUsersPage() {
  const { data: users } = await listUsers();

  return (
    <div className="page stack">
      <PageTitle title="Users">
        Seller approval opens the buyer directory; each property still needs its own ownership approval in <Link href="/admin/documents">Document review</Link>.
      </PageTitle>
      <section className="card flat">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Roles</th>
              <th>Status</th>
              <th>Seller directory access</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.name}</strong>{user.isCurrentUser ? <span className="muted"> (you)</span> : null}</td>
                <td>
                  <span className="tag-row">
                    {user.roles.map((role) => <span className="status-tag" key={role}>{roleLabel(role)}</span>)}
                  </span>
                </td>
                <td><span className={`status-tag ${(user.status || "ACTIVE") === "ACTIVE" ? "active" : "declined"}`}>{statusLabel(user.status || "ACTIVE")}</span></td>
                <td>
                  {user.roles.includes("SELLER") ? (
                    <span className={`status-tag ${user.sellerAccessStatus === "APPROVED" ? "active" : user.sellerAccessStatus === "SUSPENDED" || user.sellerAccessStatus === "REJECTED" ? "declined" : "pending"}`}>
                      {statusLabel(user.sellerAccessStatus ?? "PENDING")}
                    </span>
                  ) : <span className="muted">Not seller</span>}
                </td>
                <td>
                  <div className="actions inline">
                    {user.roles.includes("SELLER") ? (
                      <SellerAccessReviewForm
                        action={submitSellerAccessReview}
                        accessStatus={user.sellerAccessStatus}
                        accountActive={user.status === "ACTIVE"}
                        userId={user.id}
                      />
                    ) : null}
                    {user.status !== "SUSPENDED" ? (
                      <form action={submitUserSuspension}>
                        <input name="userId" type="hidden" value={user.id} />
                        <button className="button secondary sm" type="submit">{user.isCurrentUser ? "Suspend your account" : "Suspend user"}</button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function roleLabel(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function statusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
