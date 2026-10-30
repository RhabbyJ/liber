import type { SellerBuyerDetailDTO } from "../lib/buyer-dtos";
import { DEMO_BUYER_LABEL, sellerCardView } from "../lib/buyer-card-view";
import { GeneratedAvatar } from "./generated-avatar";
import { Icon } from "./icon";
import "./buyer-card.css";

// Buyers are demand, not listings: the profile header reuses the buyer-card view and never shows a property photo.
export function BuyerProfileHeader({ areaMapUrl, buyer, now }: { areaMapUrl: string | null; buyer: SellerBuyerDetailDTO; now?: Date }) {
  const card = sellerCardView(buyer, now);
  return (
    <section aria-labelledby="hdp-buyer-name" className="hdp-hero">
      <div className="hdp-hero-main">
        <div className="hdp-hero-identity">
          <GeneratedAvatar className="hdp-hero-avatar" decorative name={buyer.name} seed={buyer.avatarSeed} size="xl" variant={buyer.avatarVariant} />
          <div>
            <p className="hdp-status">
              <span className="hdp-status-dot" aria-hidden="true" />
              {["Active buyer", card.updated].filter(Boolean).join(" · ")}
            </p>
            <h1 className="hdp-hero-name" id="hdp-buyer-name">
              <span>{card.name}</span>
              {card.isDemo ? <span className="buyer-card-demo">{DEMO_BUYER_LABEL}</span> : null}
            </h1>
            {card.code ? <p className="hdp-hero-code">Account {card.code}</p> : null}
          </div>
        </div>
        <p className="hdp-price">
          <span className="visually-hidden">Budget </span>
          {card.budget}
        </p>
        <p className="buyer-card-seeking">
          <span><Icon name={card.seeking.icon} size={18} />{card.seeking.label}</span>
          <span><Icon name="map-pin" size={18} />{card.area}</span>
        </p>
        {card.needs.length > 0 ? (
          <ul aria-label="Home needs" className="buyer-card-needs">
            {card.needs.map((need) => <li key={need.label}><Icon name={need.icon} size={18} />{need.label}</li>)}
          </ul>
        ) : null}
        {card.wants.length > 0 ? (
          <ul aria-label="Wants" className="buyer-card-wants">
            {card.wants.map((want) => <li key={want.label}><Icon name={want.icon} size={16} />{want.label}</li>)}
          </ul>
        ) : null}
      </div>
      <div className="hdp-hero-side">
        <ul aria-label="Financing and verification" className="hdp-hero-signals">
          {card.signals.map((signal) => (
            <li className={`buyer-signal ${signal.tone}`} key={signal.label}>
              <Icon name={signal.icon} size={18} />
              <span>{signal.label}</span>
            </li>
          ))}
        </ul>
        <div className={`hdp-hero-area${areaMapUrl ? " has-map" : ""}`}>
          {/* Mapbox renders the streets and the approximate area-center pin in one projection. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {areaMapUrl ? <img alt="" className="hdp-hero-map" loading="lazy" src={areaMapUrl} /> : <Icon name="map-pin" size={28} />}
          <span>Approximate area · {card.area}</span>
        </div>
      </div>
    </section>
  );
}
