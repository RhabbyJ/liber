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
    </div>
  );
}
