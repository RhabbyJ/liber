import Link from "next/link";
import { Icon } from "../../../../components/icon";
import { ModeChip } from "../../../../components/mode-chip";
import { PageTitle } from "../../../../components/page-title";
import { PropertyAddressLookup } from "../../../../components/property-address-lookup";
import { submitSellerProperty } from "../../../../server/form-actions";

export default async function NewSellerPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = typeof next === "string" && next.startsWith("/seller/") ? next : null;

  return (
    <div className="page stack loose">
      <PageTitle
        eyebrow="New private property"
        title="Add property details"
        tone="seller"
        badge={<ModeChip mode="seller" />}
        actions={
          <Link className="button ghost" href="/seller/properties">
            <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
            Back to properties
          </Link>
        }
      >
        This is a private property record for buyer invites, not a public listing. Ownership documents are private and reviewed by Liber admins before trust status updates.
      </PageTitle>

      <section className="card cream stack tight">
        <div className="section-head compact">
          <span className="status-dot amber">
            <Icon name="lock" size={12} />
            Invite-only privacy
          </span>
          <p className="muted small" style={{ margin: 0 }}>
            Buyers see this property only when you choose to invite them.
          </p>
        </div>
      </section>

      <section className="card stack loose">
        <form action={submitSellerProperty} className="form-grid" encType="multipart/form-data">
          {safeNext ? <input name="next" type="hidden" value={safeNext} /> : null}

          <div className="field">
            <label htmlFor="propertyType">Property type</label>
            <select id="propertyType" name="propertyType" defaultValue="HOME">
              <option value="HOME">Residential home</option>
            </select>
            <span className="field-hint">Commercial property types return in a later release.</span>
          </div>
          <div className="field">
            <label htmlFor="price">Asking price</label>
            <input id="price" name="price" placeholder="925000" inputMode="numeric" />
            <span className="field-hint">Used only for matching; never displayed publicly.</span>
          </div>

          <PropertyAddressLookup />

          <div className="field">
            <label htmlFor="garage">Garage area</label>
            <input id="garage" name="garageArea" placeholder="420" inputMode="numeric" />
          </div>
          <div className="field">
            <label htmlFor="condition">Condition</label>
            <input id="condition" name="condition" placeholder="Well maintained" />
          </div>

          <div className="field full">
            <label htmlFor="features">Features</label>
            <textarea id="features" name="features" placeholder="Single story, no pool, attached garage, low-maintenance yard" />
          </div>

          <div className="field full">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" placeholder="Quiet single-story home with low-maintenance yard." />
          </div>

          <div className="field">
            <label htmlFor="images">Property images</label>
            <input id="images" name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple />
            <span className="field-hint">Shown only inside invites you send.</span>
          </div>
          <div className="field">
            <label htmlFor="ownership">Ownership verification</label>
            <input id="ownership" name="ownership" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
            <span className="field-hint">Stored privately. Liber admins review before trust status changes.</span>
          </div>

          <div className="auth-alert info field full">
            <strong>Ownership confirmation required</strong>
            <span>
              It is illegal to claim a property you do not legally own. Accepting an offer on a property you do not
              own or represent can be a criminal offense punishable by law. Confirming here does not replace admin
              review of ownership evidence.
            </span>
            <label className="checkbox-container" style={{ marginTop: 8 }}>
              <input name="ownershipConfirmed" required type="checkbox" value="true" />
              <span className="checkmark" />
              I confirm I legally own this property or am authorized to represent the owner.
            </label>
          </div>

          <div className="actions between" style={{ gridColumn: "1 / -1" }}>
            <Link className="button ghost" href="/seller/properties">Cancel</Link>
            <button className="button primary" type="submit">
              <Icon name="check" size={14} />
              Save property
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
