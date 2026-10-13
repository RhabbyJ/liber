import Link from "next/link";
import { PageTitle } from "../../../components/page-title";
import { SellerAccessReviewForm } from "../../../components/seller-access-review-form";
import { listUsers } from "../../../server/contracts";
import { submitSellerAccessReview, submitUserSuspension } from "../../../server/form-actions";

export default async function AdminUsersPage() {
  const { data: users } = await listUsers();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Users" />
      <div className="card flat stack tight">
        <p>Seller approval enables buyer-directory access. Sending invites also requires separate ownership approval for each property.</p>
        <p>Review the seller’s uploaded ID and matching property evidence in <Link href="/admin/documents">Document review</Link>.</p>
      </div>
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
                <td>{user.name}{user.isCurrentUser ? " (you)" : ""}</td>
                <td>{user.roles.join(", ")}</td>
                <td>{user.status || "ACTIVE"}</td>
                <td>{user.roles.includes("SELLER") ? user.sellerAccessStatus ?? "PENDING" : "Not seller"}</td>
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
                        <button className="button secondary" type="submit">{user.isCurrentUser ? "Suspend your account" : "Suspend User"}</button>
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
