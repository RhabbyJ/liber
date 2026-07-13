import { Icon } from "./icon";

export function TrustTransformation() {
  return (
    <div aria-hidden="true" className="trust-transformation">
      <span className="trust-step private">
        <span className="trust-step-icon"><Icon name="doc" size={22} /></span>
        <span>Private evidence</span>
      </span>
      <span className="trust-connector"><i /></span>
      <span className="trust-step review">
        <span className="trust-step-icon"><Icon name="lock" size={22} /></span>
        <span>Liber review</span>
      </span>
      <span className="trust-connector"><i /></span>
      <span className="trust-step verified">
        <span className="trust-step-icon"><Icon name="check-shield" size={22} /></span>
        <span>Visible badge</span>
      </span>
    </div>
  );
}
