export default function LoadingPage() {
  return (
    <div className="page narrow status-page" role="status">
      <span className="loading-spinner" aria-hidden="true" />
      <span className="visually-hidden">Loading</span>
    </div>
  );
}
