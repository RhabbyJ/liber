import Link from "next/link";
import { PageTitle } from "../../../components/page-title";
import { formatMoney } from "../../../lib/format";
import { listSellerProperties } from "../../../server/contracts";

export default async function SellerPropertiesPage() {
  const { data: properties } = await listSellerProperties();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Seller" title="Properties">
        Property context is required before an invite can be sent.
      </PageTitle>
      <section className="section-head">
        <div />
        <Link className="button" href="/seller/properties/new">Add property</Link>
      </section>
      <section className="grid two">
        {properties.map((property) => (
          <article className="card stack" key={property.id}>
            <div className="section-head compact">
              <div>
                <p className="eyebrow">{property.propertyType}</p>
                <h2>{property.title}</h2>
              </div>
              <span className="status-dot">{property.status}</span>
            </div>
            <p className="muted">{property.location}</p>
            <strong>{formatMoney(property.price)}</strong>
            <div className="pill-row">
              {property.features.map((feature) => <span className="pill" key={feature}>{feature}</span>)}
            </div>
            <p>{property.description}</p>
            <div className="actions">
              <Link className="button secondary" href={`/seller/properties/${property.id}/edit`}>Edit</Link>
              <Link className="button" href="/seller/search">Find buyers</Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
