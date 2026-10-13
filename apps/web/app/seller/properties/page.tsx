import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { PropertyTypeArtwork } from "../../../components/property-type-artwork";
import { PropertyFeatureSummary } from "../../../components/property-details-fields";
import { formatMoney } from "../../../lib/format";
import { propertySubtypeLabel } from "../../../lib/property-types";
import { listSellerProperties } from "../../../server/contracts";

export default async function SellerPropertiesPage() {
  const { data: properties } = await listSellerProperties();

  return (
    <div className="page wide stack loose">
      <PageTitle
        title="Your properties"
        actions={
          <Link className="button primary" href="/seller/properties/new">
            <Icon name="plus" size={16} />
            Add property
          </Link>
        }
      />

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
        <section className="listing-grid wide" aria-label="Your properties">
          {properties.map((property, index) => {
            const verified = property.status === "Ownership verified";
            return (
              <article className="listing-card static property-listing" key={property.id}>
                <div className="listing-card-media">
                  <PropertyTypeArtwork
                    className="listing-card-art"
                    motion="none"
                    priority={index < 2}
                    sizes="(max-width: 767px) 100vw, 360px"
                    value={property.propertyType}
                  />
                  <div className="listing-card-flags">
                    <span className="listing-flag">
                      <Icon name="lock" size={13} />
                      Invite only
                    </span>
                    <span className={`listing-flag${verified ? "" : " pending"}`}>
                      <Icon name={verified ? "check-shield" : "info"} size={13} />
                      {property.status}
                    </span>
                  </div>
                </div>
                <div className="listing-card-body">
                  <p className="listing-card-price">{property.price > 0 ? formatMoney(property.price) : "Price not set"}</p>
                  <ul className="listing-card-facts" aria-label="Home facts">
                    {property.beds ? <li><b>{property.beds}</b> bds</li> : null}
                    {property.baths ? <li><b>{property.baths}</b> ba</li> : null}
                    {property.area ? <li><b>{property.area.toLocaleString("en-US")}</b> sqft</li> : null}
                    <li className="listing-card-kind">{propertySubtypeLabel(property.propertyType)}</li>
                  </ul>
                  <h2 className="listing-card-address">{property.title}, {property.location}</h2>
                  <PropertyFeatureSummary condition={property.condition} features={property.features} />
                  {property.description ? <p className="listing-card-note">{property.description}</p> : null}
                </div>
                <div className="listing-card-actions">
                  <Link className="button secondary sm" href={`/seller/properties/${property.id}/edit`}>
                    <Icon name="pencil" size={13} />
                    Edit
                  </Link>
                  <Link className="button primary sm" href="/seller/search">
                    <Icon name="search" size={13} />
                    Find buyers
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
