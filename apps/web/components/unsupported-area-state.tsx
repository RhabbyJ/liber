type Props = {
  onSearchAnother?: () => void;
};

export function UnsupportedAreaState({ onSearchAnother }: Props) {
  return (
    <div className="unsupported-area-state" role="status">
      <strong>We’re not active there yet.</strong>
      <span>Liber currently supports selected service areas in Los Angeles.</span>
      {onSearchAnother ? (
        <button className="link-button" onClick={onSearchAnother} type="button">
          Search another area
        </button>
      ) : null}
    </div>
  );
}
