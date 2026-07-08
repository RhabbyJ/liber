import { activeServiceAreas, type ServiceArea } from "../lib/service-areas";

type Props = {
  onSelect: (area: ServiceArea) => void;
};

const pilotZipAreas = activeServiceAreas.filter((area) => area.type === "zip" && area.postalCode);

export function PilotZipSuggestions({ onSelect }: Props) {
  return (
    <div className="pilot-zip-suggestions" aria-label="Active pilot ZIP codes">
      <div className="pilot-zip-suggestions-head">Pilot ZIPs</div>
      <div className="pilot-zip-suggestions-grid">
        {pilotZipAreas.map((area) => (
          <button
            className="pilot-zip-suggestion"
            key={area.slug}
            onClick={() => onSelect(area)}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <strong>{area.postalCode}</strong>
            <span>{area.city}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
