import { AdminPagination } from "../../../components/admin-pagination";
import { PageTitle } from "../../../components/page-title";
import { listAuditLog } from "../../../server/contracts";
import { readAdminPage, type AdminPageSearchParams } from "../page-cursor";

export default async function AdminAuditLogPage({ searchParams }: { searchParams: AdminPageSearchParams }) {
  const { cursor, page: { data: auditLogs, nextCursor } } = await readAdminPage(searchParams, listAuditLog);

  return (
    <div className="page stack">
      <PageTitle title="Audit log" />
      <section className="card flat">
        <table className="table">
          <caption>Admin action history</caption>
          <thead>
            <tr>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Target</th>
              <th scope="col">Metadata</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id}>
                <td>{log.actor}</td>
                <td>{log.action}</td>
                <td>{log.target}</td>
                <td>{log.metadata ? JSON.stringify(log.metadata) : "None"}</td>
                <td>{log.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <AdminPagination basePath="/admin/audit-log" cursor={cursor} label="Audit log" nextCursor={nextCursor} />
    </div>
  );
}
