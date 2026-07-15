import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../../../components/icon";
import { normalizeAdminMessageReports, normalizeListPageInfo } from "../../../components/messaging/normalize";
import { adminReportStatusTone, formatMessagingDateTime } from "../../../components/messaging/types";
import { PageTitle } from "../../../components/page-title";
import { MessagingError } from "../../../server/messaging/errors";
import { listAdminMessageReports } from "../../../server/messaging/service";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const rawCursor = (await searchParams).cursor;
  if (Array.isArray(rawCursor)) notFound();
  const cursor = typeof rawCursor === "string" ? rawCursor : undefined;
  let result: Awaited<ReturnType<typeof listAdminMessageReports>>;
  try {
    result = await listAdminMessageReports({ cursor });
  } catch (error) {
    if (error instanceof MessagingError && error.code === "INVALID_INPUT") notFound();
    throw error;
  }
  const reports = normalizeAdminMessageReports(result);
  const pageInfo = normalizeListPageInfo(result);

  return (
    <div className="page wide stack loose">
      <PageTitle eyebrow="Admin" title="Message reports" tone="admin">
        Review only conversations surfaced by a participant report. This is not a general message browser.
      </PageTitle>
      {reports.length === 0 ? (
        <section className="card stack">
          <p className="muted">{cursor ? "No older reports remain." : "No moderation reports are queued."}</p>
          {cursor ? <Link className="button ghost self-start" href="/admin/reports">Newest reports</Link> : null}
        </section>
      ) : (
        <>
          <section aria-label="Message report queue" className="message-admin-report-list">
            {reports.map((report) => (
              <article className="card stack message-admin-report" key={report.id}>
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
                  {report.severity ? (
                    <div><dt>Severity</dt><dd>{report.severity}</dd></div>
                  ) : null}
                  <div><dt>Reported by</dt><dd>{report.reporterLabel}</dd></div>
                  <div><dt>Reported participant</dt><dd>{report.reportedLabel}</dd></div>
                  {report.priorReportCount !== undefined ? (
                    <div><dt>Prior reports</dt><dd>{report.priorReportCount}</dd></div>
                  ) : null}
                  {report.priorBlockCount !== undefined ? (
                    <div><dt>Prior blocks</dt><dd>{report.priorBlockCount}</dd></div>
                  ) : null}
                </dl>
                <div className="message-report-evidence">
                  <span className="muted small">
                    Reported message · {formatMessagingDateTime(report.message.createdAt)}
                  </span>
                  <p>{report.message.body}</p>
                </div>
                {report.details ? (
                  <div className="auth-alert info"><strong>Reporter context:</strong> {report.details}</div>
                ) : null}
                {report.surroundingMessages.length > 0 ? (
                  <details className="message-report-context">
                    <summary>View restricted surrounding context</summary>
                    <ol>
                      {report.surroundingMessages.map((message) => (
                        <li key={message.id}>
                          <strong>{message.senderLabel}:</strong> {message.body}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
                <Link className="button primary self-start" href={`/admin/reports/${report.id}`}>
                  Review report
                  <Icon name="arrow-right" size={14} />
                </Link>
              </article>
            ))}
          </section>
          {cursor || (pageInfo.hasMore && pageInfo.nextCursor) ? (
            <div className="message-inbox-pagination">
              {cursor ? <Link className="button ghost" href="/admin/reports">Newest reports</Link> : null}
              {pageInfo.hasMore && pageInfo.nextCursor ? (
                <Link className="button secondary" href={`/admin/reports?cursor=${encodeURIComponent(pageInfo.nextCursor)}`}>
                  Older reports
                </Link>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
