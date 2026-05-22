import { PageTitle } from "../../../components/page-title";

export default function AdminReportsPage() {
  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Reports" />
      <section className="card stack">
        <p className="muted">No moderation reports are queued.</p>
      </section>
    </div>
  );
}
