import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../../../../components/icon";
import { AdminReportResolutionForm } from "../../../../components/messaging/admin-report-resolution-form";
import { normalizeAdminMessageReports } from "../../../../components/messaging/normalize";
import { adminReportStatusTone, formatMessagingDateTime } from "../../../../components/messaging/types";
import { PageTitle } from "../../../../components/page-title";
import { MessagingError } from "../../../../server/messaging/errors";
import { getAdminMessageReport } from "../../../../server/messaging/service";

export default async function AdminMessageReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  let detail: Awaited<ReturnType<typeof getAdminMessageReport>>;
  try {
    detail = await getAdminMessageReport(reportId);
  } catch (error) {
    if (error instanceof MessagingError && (error.code === "NOT_FOUND" || error.code === "UNAVAILABLE")) notFound();
    throw error;
  }
  const [report] = normalizeAdminMessageReports([detail.data]);
  if (!report) notFound();

  return (
    <div className="page stack loose">
      <PageTitle
        actions={
          <Link className="button ghost" href="/admin/reports">
            <Icon name="arrow-left" size={14} />
            Report queue
          </Link>
        }
        eyebrow="Audited review"
        title="Message report"
        tone="admin"
      >
        This restricted context is available because a participant reported a specific message.
      </PageTitle>

      <article className="card stack message-admin-report">
        <div className="section-head compact">
          <div>
            <p className="eyebrow admin">{report.category.replaceAll("_", " ")}</p>
            <h2>{report.propertyTitle}</h2>
          </div>
          <span className={`status-dot ${adminReportStatusTone(report.status)}`}>
            {report.status.replaceAll("_", " ")}
          </span>
        </div>
        <dl className="message-report-facts">
          <div><dt>Reported by</dt><dd>{report.reporterLabel}</dd></div>
          <div><dt>Reported participant</dt><dd>{report.reportedLabel}</dd></div>
          {report.inviteStatus ? <div><dt>Invite</dt><dd>{report.inviteStatus}</dd></div> : null}
          {report.severity ? <div><dt>Severity</dt><dd>{report.severity}</dd></div> : null}
          {report.priorReportCount !== undefined ? <div><dt>Prior reports</dt><dd>{report.priorReportCount}</dd></div> : null}
          {report.priorBlockCount !== undefined ? <div><dt>Prior blocks</dt><dd>{report.priorBlockCount}</dd></div> : null}
        </dl>
        <div className="message-report-evidence">
          <span className="muted small">Reported message · {formatMessagingDateTime(report.message.createdAt)}</span>
          <p>{report.message.body}</p>
        </div>
        {report.details ? <div className="auth-alert info"><strong>Reporter context:</strong> {report.details}</div> : null}
        {report.resolution ? (
          <div className="auth-alert info"><strong>Current resolution:</strong> {report.resolution}</div>
        ) : null}
        {report.surroundingMessages.length > 0 ? (
          <section className="stack tight" aria-labelledby="report-context-heading">
            <h3 id="report-context-heading">Restricted surrounding context</h3>
            <ol className="message-report-context-list">
              {report.surroundingMessages.map((message) => (
                <li key={message.id}>
                  <strong>{message.senderLabel}:</strong> {message.body}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <AdminReportResolutionForm
          initialResolution={report.resolution ?? ""}
          initialStatus={report.status}
          reportId={report.id}
        />
      </article>
    </div>
  );
}
