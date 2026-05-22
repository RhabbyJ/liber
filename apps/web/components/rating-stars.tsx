export function RatingStars({
  rating,
  reviewCount,
}: {
  rating: number;
  reviewCount?: number;
}) {
  const normalized = Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
  const filled = Math.round(normalized);
  const stars = `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
  const label = `${normalized.toFixed(1)} out of 5`;

  return (
    <span className="rating" aria-label={reviewCount === undefined ? label : `${label}, ${reviewCount} reviews`}>
      <span aria-hidden="true">{stars}</span>
      <strong>{normalized.toFixed(1)}</strong>
      {reviewCount === undefined ? null : <span className="muted"> ({reviewCount} reviews)</span>}
    </span>
  );
}
