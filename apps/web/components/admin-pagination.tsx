import Link from "next/link";

/** First/next links for cursor-paginated admin lists. Renders nothing for a single page. */
export function AdminPagination({ basePath, cursor, label, nextCursor }: {
  basePath: string;
  cursor?: string;
  label: string;
  nextCursor: string | null;
}) {
  if (!cursor && !nextCursor) return null;
  return (
    <nav aria-label={`${label} pages`} className="actions">
      {cursor ? <Link className="button ghost" href={basePath}>First page</Link> : null}
      {nextCursor ? (
        <Link className="button secondary" href={`${basePath}?cursor=${encodeURIComponent(nextCursor)}`}>Next page</Link>
      ) : null}
    </nav>
  );
}
