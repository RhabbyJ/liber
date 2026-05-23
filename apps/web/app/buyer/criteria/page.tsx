import Link from "next/link";
import { PageTitle } from "../../../components/page-title";
import { getCurrentBuyerProfile } from "../../../server/contracts";
import { submitBuyerCriteria } from "../../../server/form-actions";

const priceMinOptions = [
  { label: "No minimum", value: "" },
  { label: "$500k", value: "500000" },
  { label: "$750k", value: "750000" },
  { label: "$1M", value: "1000000" },
  { label: "$1.5M", value: "1500000" },
  { label: "$2M", value: "2000000" },
];

const priceMaxOptions = [
  { label: "$500k", value: "500000" },
  { label: "$750k", value: "750000" },
  { label: "$1M", value: "1000000" },
  { label: "$1.5M", value: "1500000" },
  { label: "$2M", value: "2000000" },
  { label: "$3M+", value: "3000000" },
];

const bedroomsOptions = [
  { label: "Any bedrooms", value: "" },
  { label: "1+ bedrooms", value: "1" },
  { label: "2+ bedrooms", value: "2" },
  { label: "3+ bedrooms", value: "3" },
  { label: "4+ bedrooms", value: "4" },
  { label: "5+ bedrooms", value: "5" },
];

const bathroomsOptions = [
  { label: "Any bathrooms", value: "" },
  { label: "1+ bathrooms", value: "1" },
  { label: "2+ bathrooms", value: "2" },
  { label: "3+ bathrooms", value: "3" },
  { label: "4+ bathrooms", value: "4" },
];

const squareFeetOptions = [
  { label: "Any square feet", value: "" },
  { label: "1,000+ sqft", value: "1000" },
  { label: "1,500+ sqft", value: "1500" },
  { label: "2,000+ sqft", value: "2000" },
  { label: "2,500+ sqft", value: "2500" },
  { label: "3,000+ sqft", value: "3000" },
  { label: "4,000+ sqft", value: "4000" },
];

const lotSizeOptions = [
  { label: "Any lot size", value: "" },
  { label: "2,500+ lot sqft", value: "2500" },
  { label: "5,000+ lot sqft", value: "5000" },
  { label: "7,500+ lot sqft", value: "7500" },
  { label: "10,000+ lot sqft", value: "10000" },
  { label: "15,000+ lot sqft", value: "15000" },
];

const conditionOptions = ["Any condition", "Move-in ready", "Light updates", "Fixer"];

export default async function BuyerCriteriaPage() {
  const { data: buyer } = await getCurrentBuyerProfile();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Buyer" title="Home search criteria">
        Choose simple residential preferences sellers can match against their property.
      </PageTitle>

      <section className="card stack">
        <form action={submitBuyerCriteria} className="form-grid">
          <input name="buyerProfileId" type="hidden" value={buyer.id} />
          <div className="field">
            <label htmlFor="subtype">Property type</label>
            <select id="subtype" name="propertySubtype" defaultValue="HOME">
              <option value="HOME">Residential home</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="condition">Condition</label>
            <select id="condition" name="condition" defaultValue="">
              {conditionOptions.map((option) => (
                <option key={option} value={option === "Any condition" ? "" : option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="priceMin">Price min</label>
            <select id="priceMin" name="priceMin" defaultValue={String(buyer.budgetMin || "")}>
              {priceMinOptions.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="priceMax">Price max</label>
            <select id="priceMax" name="priceMax" defaultValue={String(buyer.budgetMax || "1000000")}>
              {priceMaxOptions.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="beds">Bedrooms min</label>
            <select id="beds" name="bedroomsMin" defaultValue="">
              {bedroomsOptions.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="baths">Bathrooms min</label>
            <select id="baths" name="bathroomsMin" defaultValue="">
              {bathroomsOptions.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sqft">Square feet min</label>
            <select id="sqft" name="squareFeetMin" defaultValue="">
              {squareFeetOptions.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lot">Lot size min</label>
            <select id="lot" name="lotSizeMin" defaultValue="">
              {lotSizeOptions.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="yearBuiltMin">Year built</label>
            <select id="yearBuiltMin" name="yearBuiltMin" defaultValue="">
              <option value="">Any year</option>
              <option value="1950">1950 or newer</option>
              <option value="1970">1970 or newer</option>
              <option value="1990">1990 or newer</option>
              <option value="2010">2010 or newer</option>
            </select>
          </div>
          <div className="field full">
            <label htmlFor="features">Needs and preferences</label>
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
            <button className="button" type="submit">Save search criteria</button>
          </div>
        </form>
      </section>
    </div>
  );
}
