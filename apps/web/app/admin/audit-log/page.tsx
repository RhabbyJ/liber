import { PageTitle } from "../../../components/page-title";
import { listAuditLog } from "../../../server/contracts";

export default async function AdminAuditLogPage() {
  const { data: auditLogs } = await listAuditLog();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Audit log">
        Sensitive trust, role, document, and moderation actions are recorded here.
      </PageTitle>
      <section className="card flat">
        <table className="table">
          <thead>
            <tr>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id}>
                <td>{log.actor}</td>
                <td>{log.action}</td>
                <td>{log.target}</td>
                <td>{log.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
