import { PageTitle } from "../../../components/page-title";
import { listUsers } from "../../../server/contracts";
import { submitSellerAccessReview, submitUserSuspension } from "../../../server/form-actions";

export default async function AdminUsersPage() {
  const { data: users } = await listUsers();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Users" />
      <section className="card flat">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Roles</th>
              <th>Status</th>
              <th>Seller access</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.roles.join(", ")}</td>
                <td>{user.status || "ACTIVE"}</td>
                <td>{user.roles.includes("SELLER") ? user.sellerAccessStatus ?? "PENDING" : "Not seller"}</td>
                <td>
                  <div className="actions inline">
                    {user.roles.includes("SELLER") ? (
                      <>
                        <form action={submitSellerAccessReview}>
                          <input name="userId" type="hidden" value={user.id} />
                          <input name="status" type="hidden" value="APPROVED" />
                          <button className="button" type="submit">Approve Seller</button>
                        </form>
                        <form action={submitSellerAccessReview}>
                          <input name="userId" type="hidden" value={user.id} />
                          <input name="status" type="hidden" value="SUSPENDED" />
                          <button className="button secondary" type="submit">Suspend Seller</button>
                        </form>
                      </>
                    ) : null}
                    <form action={submitUserSuspension}>
                      <input name="userId" type="hidden" value={user.id} />
                      <button className="button secondary" type="submit">Suspend User</button>
                    </form>
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
