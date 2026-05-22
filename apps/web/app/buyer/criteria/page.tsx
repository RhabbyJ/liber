import Link from "next/link";
import { PageTitle } from "../../../components/page-title";
import { getCurrentBuyerProfile } from "../../../server/contracts";
import { submitBuyerCriteria } from "../../../server/form-actions";

const categories = ["Home", "Land", "Multifamily", "Retail", "STNL", "Industrial", "Office", "Other"];

export default async function BuyerCriteriaPage() {
  const { data: buyer } = await getCurrentBuyerProfile();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Buyer" title="Criteria">
        Common searchable fields stay structured; subtype-specific details stay in extra criteria.
      </PageTitle>

      <section className="card stack">
        <div className="tab-row">
          {categories.map((category) => (
            <button className={category === "Home" ? "tab active" : "tab"} key={category} type="button">
              {category}
            </button>
          ))}
        </div>
        <form action={submitBuyerCriteria} className="form-grid">
          <input name="buyerProfileId" type="hidden" value={buyer.id} />
          <input name="propertyCategory" type="hidden" value="HOME" />
          <div className="field">
            <label htmlFor="subtype">Property subtype</label>
            <select id="subtype" name="propertySubtype" defaultValue="HOME">
              <option value="HOME">Home</option>
              <option value="MULTIFAMILY">Multifamily</option>
              <option value="LAND">Land</option>
              <option value="RETAIL">Retail</option>
              <option value="STNL">STNL</option>
              <option value="INDUSTRIAL">Industrial</option>
              <option value="OFFICE">Office</option>
              <option value="OTHER">Other commercial</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="condition">Condition</label>
            <input id="condition" name="condition" defaultValue="Move-in ready" />
          </div>
          <div className="field">
            <label htmlFor="priceMin">Price min</label>
            <input id="priceMin" name="priceMin" defaultValue={buyer.budgetMin || ""} />
          </div>
          <div className="field">
            <label htmlFor="priceMax">Price max</label>
            <input id="priceMax" name="priceMax" defaultValue={buyer.budgetMax || ""} />
          </div>
          <div className="field">
            <label htmlFor="beds">Bedrooms min</label>
            <input id="beds" name="bedroomsMin" defaultValue="4" />
          </div>
          <div className="field">
            <label htmlFor="baths">Bathrooms min</label>
            <input id="baths" name="bathroomsMin" defaultValue="2" />
          </div>
          <div className="field">
            <label htmlFor="sqft">Square feet min</label>
            <input id="sqft" name="squareFeetMin" defaultValue="1800" />
          </div>
          <div className="field">
            <label htmlFor="sqftMax">Square feet max</label>
            <input id="sqftMax" name="squareFeetMax" />
          </div>
          <div className="field">
            <label htmlFor="lot">Lot size min</label>
            <input id="lot" name="lotSizeMin" defaultValue="5000" />
          </div>
          <div className="field">
            <label htmlFor="lotMax">Lot size max</label>
            <input id="lotMax" name="lotSizeMax" />
          </div>
          <div className="field">
            <label htmlFor="capRateMin">Cap rate min</label>
            <input id="capRateMin" name="capRateMin" placeholder="Commercial" />
          </div>
          <div className="field">
            <label htmlFor="capRateMax">Cap rate max</label>
            <input id="capRateMax" name="capRateMax" placeholder="Commercial" />
          </div>
          <div className="field">
            <label htmlFor="unitsMin">Units min</label>
            <input id="unitsMin" name="unitsMin" placeholder="Multifamily" />
          </div>
          <div className="field">
            <label htmlFor="unitsMax">Units max</label>
            <input id="unitsMax" name="unitsMax" placeholder="Multifamily" />
          </div>
          <div className="field">
            <label htmlFor="yearBuiltMin">Year built min</label>
            <input id="yearBuiltMin" name="yearBuiltMin" />
          </div>
          <div className="field">
            <label htmlFor="yearBuiltMax">Year built max</label>
            <input id="yearBuiltMax" name="yearBuiltMax" />
          </div>
          <div className="field">
            <label htmlFor="zoning">Zoning</label>
            <input id="zoning" name="zoning" placeholder="Residential, commercial, industrial" />
          </div>
          <div className="field full">
            <label htmlFor="features">Special features</label>
            <textarea id="features" name="features" defaultValue={buyer.needs.join(", ")} />
          </div>
          <div className="field full">
            <label htmlFor="location">Location picker</label>
            <div className="map-shell small">
              <span className="map-pin" />
              <strong>{buyer.location}</strong>
            </div>
          </div>
          <div className="actions">
            <Link className="button secondary" href="/buyer/profile">Back to profile</Link>
            <button className="button" type="submit">Save criteria</button>
          </div>
        </form>
      </section>
    </div>
  );
}
