import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { ModeChip } from "../../../components/mode-chip";
import { PageTitle } from "../../../components/page-title";
import { formatMoney } from "../../../lib/format";
import { propertySubtypeLabel } from "../../../lib/property-types";
import { listSellerProperties } from "../../../server/contracts";

export default async function SellerPropertiesPage() {
  const { data: properties } = await listSellerProperties();

  return (
    <div className="page wide stack loose">
      <PageTitle
        eyebrow="Private property records"
        title="Your properties"
        tone="seller"
        badge={<ModeChip mode="seller" />}
        actions={
          <Link className="button primary" href="/seller/properties/new">
            <Icon name="plus" size={14} />
            Add property
          </Link>
        }
      >
        Property records are required before sending an invite. They stay private and are only shared with the buyers you invite.
      </PageTitle>

      <section className="card cream stack">
        <div className="section-head compact">
          <div className="stack tight">
            <p className="eyebrow amber">Privacy</p>
            <h2 style={{ fontSize: 20 }}>Not a public listing</h2>
          </div>
          <span className="status-dot amber">
            <Icon name="lock" size={12} />
            Invite-only
          </span>
        </div>
        <p>
          Your property is not listed publicly anywhere on Liber. Address, asking price, photos, and ownership documents are
          only shown to the buyer profiles you choose to invite — and ownership documents stay admin-private regardless.
        </p>
      </section>

      {properties.length === 0 ? (
        <EmptyState
          icon="home"
          title="No private properties yet"
          description="Add a property to send invites to matching buyers. Ownership documents are stored privately and reviewed by Liber admins."
          actions={
            <Link className="button primary" href="/seller/properties/new">
              <Icon name="plus" size={14} />
              Add your first property
            </Link>
          }
        />
      ) : (
        <section className="grid two">
          {properties.map((property) => {
            const verified = property.ownershipVerificationStatus === "APPROVED";
            return (
              <article className="property-card" key={property.id}>
                <div className="media-preview">
                  <span className="media-hint">
                    <Icon name="home" size={12} />
                    Private property
                  </span>
                </div>
                <div className="property-card-body">
                  <div className="section-head compact">
                    <div className="stack tight">
                      <p className="eyebrow">{propertySubtypeLabel(property.propertyType)}</p>
                      <h3>{property.title}</h3>
                    </div>
                    <span className={`status-dot ${verified ? "active" : "warning"}`}>
                      <Icon name={verified ? "check-shield" : "info"} size={12} />
                      {property.status}
                    </span>
                  </div>
                  <p className="muted small">
                    <Icon name="map-pin" size={12} /> {property.location}
                  </p>
                  <div className="property-card-stats">
                    {property.beds ? <span className="pill"><Icon name="home" size={12} />{property.beds} beds</span> : null}
                    {property.baths ? <span className="pill">{property.baths} baths</span> : null}
                    {property.area ? <span className="pill">{property.area} sqft</span> : null}
                  </div>
                  <strong style={{ fontSize: 20 }}>{formatMoney(property.price)}</strong>
                  {property.description ? <p className="muted small">{property.description}</p> : null}
                  <div className="actions between">
                    <Link className="button ghost" href={`/seller/properties/${property.id}/edit`}>
                      <Icon name="pencil" size={13} />
                      Edit
                    </Link>
                    <Link className="button primary" href="/seller/search">
                      <Icon name="search" size={13} />
                      Find buyers
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
