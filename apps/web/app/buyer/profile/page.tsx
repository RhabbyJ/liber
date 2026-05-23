import Link from "next/link";
import { BadgePill } from "../../../components/badge-pill";
import { LocationLookupFields } from "../../../components/location-lookup-fields";
import { PageTitle } from "../../../components/page-title";
import { formatRange } from "../../../lib/format";
import { getCurrentBuyerProfile } from "../../../server/contracts";
import { submitBuyerProfile } from "../../../server/form-actions";

const budgetMinOptions = [
  { label: "No minimum", value: "" },
  { label: "$500k", value: "500000" },
  { label: "$750k", value: "750000" },
  { label: "$1M", value: "1000000" },
  { label: "$1.5M", value: "1500000" },
  { label: "$2M", value: "2000000" },
];

const budgetMaxOptions = [
  { label: "$500k", value: "500000" },
  { label: "$750k", value: "750000" },
  { label: "$1M", value: "1000000" },
  { label: "$1.5M", value: "1500000" },
  { label: "$2M", value: "2000000" },
  { label: "$3M+", value: "3000000" },
];

const downPaymentOptions = [
  { label: "No minimum", value: "" },
  { label: "$50k", value: "50000" },
  { label: "$100k", value: "100000" },
  { label: "$200k", value: "200000" },
  { label: "$300k", value: "300000" },
  { label: "$500k+", value: "500000" },
];

const buyerTypeOptions = ["Home Buyer", "Investor", "Cash Buyer", "Move-up Buyer", "Downsizing Buyer"];
const buyingPurposeOptions = ["Owner occupy", "Rental", "Fix and flip", "Other"];

export default async function BuyerProfileBuilderPage() {
  const { data: buyer } = await getCurrentBuyerProfile();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Buyer" title="Profile builder">
        Submit the profile when it is ready to appear in seller search.
      </PageTitle>

      <section className="grid two">
        <form action={submitBuyerProfile} className="card stack" encType="multipart/form-data">
          <div className="section-head compact">
            <div>
              <p className="eyebrow">Personal details</p>
              <h2>{buyer.name}</h2>
            </div>
            <span className={`status-dot ${buyer.visibility === "active" ? "active" : ""}`}>
              {buyer.visibility}
            </span>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input id="displayName" name="displayName" defaultValue={buyer.name} />
            </div>
            <div className="field">
              <label htmlFor="avatar">Profile photo</label>
              <input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" />
            </div>
            <div className="field">
              <label htmlFor="buyerType">Buyer type</label>
              <select id="buyerType" name="buyerType" defaultValue={buyer.type || "Home Buyer"}>
                {buyerTypeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <LocationLookupFields
              cityName="desiredCity"
              defaultCity={buyer.city}
              defaultLat={buyer.lat || ""}
              defaultLng={buyer.lng || ""}
              defaultLocation={buyer.location}
              inputName="desiredLocationText"
              intent="store"
              label="Desired pilot area or ZIP"
              latName="desiredLat"
              lngName="desiredLng"
              stateName="desiredState"
            />
            <div className="field">
              <label htmlFor="budgetMin">Budget min</label>
              <select id="budgetMin" name="budgetMin" defaultValue={String(buyer.budgetMin || "")}>
                {budgetMinOptions.map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="budgetMax">Budget max</label>
              <select id="budgetMax" name="budgetMax" defaultValue={String(buyer.budgetMax || "1000000")}>
                {budgetMaxOptions.map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="downPaymentMin">Down payment min</label>
              <select id="downPaymentMin" name="downPaymentMin" defaultValue={String(buyer.downPaymentMin || "")}>
                {downPaymentOptions.map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="downPaymentMax">Down payment max</label>
              <select id="downPaymentMax" name="downPaymentMax" defaultValue={String(buyer.downPaymentMax || "200000")}>
                {downPaymentOptions.slice(1).map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="purpose">Buying purpose</label>
              <select id="purpose" name="buyingPurpose" defaultValue={buyer.purpose || "Owner occupy"}>
                {buyingPurposeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="bio">Bio</label>
              <textarea id="bio" name="bio" defaultValue={buyer.bio} />
            </div>
          </div>
          <div className="actions">
            <Link className="button secondary" href="/buyer/criteria">Edit criteria</Link>
            <Link className="button secondary" href="/buyer/badges">Buyer verification</Link>
            <button className="button" name="visibilityStatus" type="submit" value="ACTIVE">Submit Profile</button>
          </div>
        </form>

        <aside className="card stack">
          <div className="profile-photo" aria-label={`${buyer.name} profile photo`}>
            {buyer.avatarUrl ? (
              <img src={buyer.avatarUrl} alt={`${buyer.name} profile photo`} />
            ) : (
              buyer.name.slice(0, 1)
            )}
          </div>
          <div>
            <p className="eyebrow">Preview</p>
            <h2>{buyer.name}</h2>
            <p className="muted">{buyer.location}</p>
          </div>
          <strong>{formatRange(buyer.budgetMin, buyer.budgetMax)}</strong>
          <p>{buyer.purpose}</p>
          <div className="pill-row">
            {buyer.badges.map((badge) => (
              <BadgePill badge={badge} key={badge.label} />
            ))}
          </div>
          {buyer.visibility === "active" && buyer.id !== "new-profile" ? (
            <Link className="button secondary" href={`/buyers/${buyer.id}`}>View public profile</Link>
          ) : (
            <p className="muted">Submit the profile before sharing the public page.</p>
          )}
        </aside>
      </section>
    </div>
  );
}
