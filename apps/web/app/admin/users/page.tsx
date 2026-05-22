import { PageTitle } from "../../../components/page-title";
import { listUsers } from "../../../server/contracts";
import { submitUserSuspension } from "../../../server/form-actions";

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
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.roles.join(", ")}</td>
                <td>{user.status || "ACTIVE"}</td>
                <td>
                  <form action={submitUserSuspension}>
                    <input name="userId" type="hidden" value={user.id} />
                    <button className="button secondary" type="submit">Suspend</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
