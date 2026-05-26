import Link from "next/link";
import { Avatar } from "../../../components/avatar";
import { BadgePill } from "../../../components/badge-pill";
import { Icon } from "../../../components/icon";
import { LocationLookupFields } from "../../../components/location-lookup-fields";
import { ModeChip } from "../../../components/mode-chip";
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
  const isActive = buyer.visibility === "active";
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");

  return (
    <div className="page wide stack loose">
      <PageTitle
        eyebrow="Your buyer profile"
        title="Build a profile that gets you found"
        tone="buyer"
        badge={<ModeChip mode="buyer" />}
        actions={
          <span className={`status-dot ${isActive ? "active" : "warning"}`}>
            {isActive ? "Live to sellers" : "Draft — not yet visible"}
          </span>
        }
      >
        Liber turns your story into a searchable demand profile. Submit when ready — you can update anytime.
      </PageTitle>

      <section className="grid sidebar">
        <form action={submitBuyerProfile} className="card stack loose" encType="multipart/form-data">
          <div className="section-stack">
            <p className="eyebrow">Step 1 of 3</p>
            <h2>Personal details &amp; intent</h2>
            <p className="muted small">Sellers see this card first. Keep it clear and human.</p>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input id="displayName" name="displayName" defaultValue={buyer.name} placeholder="Julie P." />
              <span className="field-hint">Most buyers use first name + last initial.</span>
            </div>
            <div className="field">
              <label htmlFor="avatar">Profile photo</label>
              <input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" />
              <span className="field-hint">PNG, JPEG, or WebP. Optional.</span>
            </div>
            <div className="field">
              <label htmlFor="buyerType">Buyer type</label>
              <select id="buyerType" name="buyerType" defaultValue={buyer.type || "Home Buyer"}>
                {buyerTypeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="purpose">Buying purpose</label>
              <select id="purpose" name="buyingPurpose" defaultValue={buyer.purpose || "Owner occupy"}>
                {buyingPurposeOptions.map((option) => (
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
          </div>

          <div className="divider" />

          <div className="section-stack">
            <p className="eyebrow">Step 2 of 3</p>
            <h2>Budget &amp; down payment</h2>
            <p className="muted small">Ranges, not exact numbers. Sellers filter their search against this.</p>
          </div>
          <div className="form-grid">
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
          </div>

          <div className="divider" />

          <div className="section-stack">
            <p className="eyebrow">Step 3 of 3</p>
            <h2>Your story</h2>
            <p className="muted small">A short bio helps sellers understand what you're looking for and why.</p>
          </div>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                name="bio"
                defaultValue={buyer.bio}
                placeholder="Looking to simplify life in a quiet, comfortable home with low maintenance and good access to family."
              />
            </div>
          </div>

          <div className="actions between">
            <div className="actions inline">
              <Link className="button secondary" href="/buyer/criteria">
                <Icon name="list" size={14} />
                Edit criteria
              </Link>
              <Link className="button ghost" href="/buyer/badges">
                <Icon name="shield" size={14} />
                Verification
              </Link>
            </div>
            <button className="button primary" name="visibilityStatus" type="submit" value="ACTIVE">
              <Icon name="sparkle" size={14} />
              Submit profile
            </button>
          </div>
        </form>

        <aside className="public-profile-aside">
          <article className="card stack">
            <p className="eyebrow">Live preview</p>
            <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="profile-photo">
                <Avatar
                  name={buyer.name}
                  size="xl"
                  src={buyer.avatarUrl}
                />
              </div>
              <div style={{ textAlign: "center" }}>
                <h2 style={{ fontSize: 22, margin: 0 }}>{buyer.name}</h2>
                <p className="muted small" style={{ marginTop: 4 }}>{buyer.location}</p>
              </div>
            </div>
            <div className="summary-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div>
                <span className="summary-label">Budget</span>
                <span className="summary-value">{formatRange(buyer.budgetMin, buyer.budgetMax)}</span>
              </div>
              <div>
                <span className="summary-label">Down payment</span>
                <span className="summary-value">{formatRange(buyer.downPaymentMin, buyer.downPaymentMax)}</span>
              </div>
              <div>
                <span className="summary-label">Buying for</span>
                <span className="summary-value">{buyer.purpose}</span>
              </div>
            </div>
            {activeBadges.length > 0 ? (
              <div className="pill-row">
                {activeBadges.map((badge) => (
                  <BadgePill badge={badge} key={badge.label} />
                ))}
              </div>
            ) : (
              <p className="muted small">
                No active trust badges yet. <Link href="/buyer/badges">Get verified</Link> to stand out in seller search.
              </p>
            )}
            {isActive && buyer.id !== "new-profile" ? (
              <Link className="button secondary" href={`/buyers/${buyer.id}`}>
                <Icon name="eye" size={14} />
                View as seller
              </Link>
            ) : (
              <p className="muted small">Submit the profile before sharing the seller-facing page.</p>
            )}
          </article>
        </aside>
      </section>
    </div>
  );
}
