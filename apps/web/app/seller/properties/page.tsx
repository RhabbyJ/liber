import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { PropertyTypeArtwork } from "../../../components/property-type-artwork";
import { formatMoney } from "../../../lib/format";
import { propertySubtypeLabel } from "../../../lib/property-types";
import { listSellerProperties } from "../../../server/contracts";

export default async function SellerPropertiesPage() {
  const { data: properties } = await listSellerProperties();

  return (
    <div className="page wide stack loose">
      <PageTitle
        eyebrow="Invite-only records"
        title="Your properties"
        tone="seller"
        actions={
          <Link className="button primary" href="/seller/properties/new">
            <Icon name="plus" size={14} />
            Add property
          </Link>
        }
      >
        Listings are not public. Buyers only see a property when you invite them.
      </PageTitle>

      {properties.length === 0 ? (
        <EmptyState
          icon="home"
          title="No properties yet"
          description="Add a property to invite matching buyers."
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
            const verified = property.status.toLowerCase().includes("verified");
            return (
              <article className="property-card" key={property.id}>
                <div className="media-preview">
                  <PropertyTypeArtwork
                    className="property-card-artwork"
                    sizes="(max-width: 760px) 100vw, 50vw"
                    value={property.propertyType}
                  />
                  <span className="media-hint">
                    <Icon name="home" size={12} />
                    Invite only
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
