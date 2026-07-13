export function DemandAtlasBackdrop() {
  return (
    <div aria-hidden="true" className="demand-atlas-backdrop">
      <span className="demand-atlas-street street-a" />
      <span className="demand-atlas-street street-b" />
      <span className="demand-atlas-parcel parcel-a" />
      <span className="demand-atlas-parcel parcel-b" />
      <span className="demand-atlas-parcel parcel-c" />
      <span className="demand-atlas-halo halo-a"><i /></span>
      <span className="demand-atlas-halo halo-b"><i /></span>
    </div>
  );
}

export function DemandPrivacyLegend() {
  return (
    <span aria-hidden="true" className="demand-privacy-legend">
      <span className="privacy-exact-point" />
      <span className="privacy-legend-connector" />
      <span className="privacy-halo"><i /></span>
      <span className="privacy-legend-connector" />
      <span className="privacy-demand-signal"><i /></span>
    </span>
  );
}
