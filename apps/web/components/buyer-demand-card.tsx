import Link from "next/link";
import type { HTMLAttributes } from "react";
import { DEMO_BUYER_LABEL, type BuyerCardView } from "../lib/buyer-card-view";
import { GeneratedAvatar } from "./generated-avatar";
import { Icon } from "./icon";
import "./buyer-card.css";

type Props = {
  /** Extra article behavior, such as the public preview's pin highlighting. */
  articleProps?: HTMLAttributes<HTMLElement>;
  /** Approved-seller cards carry their routing ID so the map can highlight them. */
  buyerId?: string;
  view: BuyerCardView;
};

/**
 * A buyer is demand, not a listing: the card leads with who is buying, their budget and
 * proof of funds, then what home they want. No property photos.
 */
export function BuyerDemandCard({ articleProps, buyerId, view }: Props) {
  return (
    <article
      aria-label={view.href ? undefined : view.ariaLabel}
      className={`buyer-card${view.href ? " linked" : ""}`}
      data-buyer-id={buyerId}
      {...articleProps}
    >
      <div className="buyer-card-top">
        <GeneratedAvatar className="buyer-card-avatar" decorative name={view.avatar.name} seed={view.avatar.seed} variant={view.avatar.variant} />
        <div className="buyer-card-who">
          <p className="buyer-card-name">
            <span>{view.name}</span>
            {view.isDemo ? <span className="buyer-card-demo">{DEMO_BUYER_LABEL}</span> : null}
          </p>
          <p className="buyer-card-budget">{view.budget}</p>
        </div>
        <ul aria-label="Financing and verification" className="buyer-card-signals">
          {view.signals.map((signal) => (
            <li className={`buyer-signal ${signal.tone}`} key={signal.label}>
              <Icon name={signal.icon} size={18} />
              <span>{signal.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="buyer-card-seeking">
        <span><Icon name={view.seeking.icon} size={18} />{view.seeking.label}</span>
        <span><Icon name="map-pin" size={18} />{view.area}</span>
      </p>

      {view.needs.length > 0 ? (
        <ul aria-label="Home needs" className="buyer-card-needs">
          {view.needs.map((need) => (
            <li key={need.label}><Icon name={need.icon} size={18} />{need.label}</li>
          ))}
        </ul>
      ) : null}

      {view.wants.length > 0 ? (
        <ul aria-label="Wants" className="buyer-card-wants">
          {view.wants.map((want) => (
            <li key={want.label}><Icon name={want.icon} size={16} />{want.label}</li>
          ))}
        </ul>
      ) : null}

      {view.code || view.updated || view.href ? (
        <div className="buyer-card-foot">
          <span>{[view.code, view.updated].filter(Boolean).join(" · ")}</span>
          {view.href ? (
            <span aria-hidden="true" className="buyer-card-cta">
              View profile
              <Icon name="chevron-right" size={16} />
            </span>
          ) : null}
        </div>
      ) : null}

      {view.href ? <Link aria-label={view.ariaLabel} className="buyer-card-link" href={view.href} /> : null}
    </article>
  );
}
