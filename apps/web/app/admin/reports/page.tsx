import { PageTitle } from "../../../components/page-title";

const reports = [
  {
    id: "report-1",
    type: "Invite volume",
    subject: "Seller Fixture",
    status: "Open",
  },
  {
    id: "report-2",
    type: "Profile accuracy",
    subject: "Draft Buyer",
    status: "Queued",
  },
];

export default function AdminReportsPage() {
  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Reports" />
      <section className="grid two">
        {reports.map((report) => (
          <article className="card stack" key={report.id}>
            <p className="eyebrow">{report.type}</p>
            <h2>{report.subject}</h2>
            <span className="status-dot">{report.status}</span>
          </article>
        ))}
      </section>
    </div>
  );
}
