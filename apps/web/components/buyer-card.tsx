import Link from "next/link";
import type { SellerBadgeDTO, SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { compactBudgetRange, criteriaFacts, seekingLabel } from "../lib/listing-format";
import { GeneratedAvatar } from "./generated-avatar";
import { Icon } from "./icon";
import { PropertyTypeArtwork } from "./property-type-artwork";

const flagOrder = ["PRE_APPROVED", "CASH_BUYER", "VERIFIED_FUNDS", "VERIFIED_IDENTITY"];
const TEST_LABEL = "Test pre-approval — not verified";

export function BuyerCard({ buyer, priority = false }: { buyer: SellerBuyerSummaryDTO; priority?: boolean }) {
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const testPreApproval = activeBadges.find((badge) => badge.type === "TEST_PRE_APPROVED");
  const preApproval = activeBadges.find((badge) => badge.type === "PRE_APPROVED");
  // Real badges first; a test badge always keeps its own marker so it can never hide behind them.
  const flags = activeBadges
    .filter((badge) => badge.type !== "TEST_PRE_APPROVED")
    .sort((a, b) => flagRank(a.type) - flagRank(b.type))
    .slice(0, 2);
  const facts = criteriaFacts(buyer.criteriaDetails[0]);
  const fineprint = [buyer.name, buyer.type].filter(Boolean).join(" · ");

  return (
    <article className="listing-card" data-buyer-id={buyer.id}>
      <div className="listing-card-media">
        <PropertyTypeArtwork className="listing-card-art" motion="none" priority={priority} seed={buyer.id} sizes="(max-width: 767px) 100vw, 360px" value={buyer.purpose} />
        {flags.length > 0 || buyer.isDemo || testPreApproval ? (
          <div className="listing-card-flags">
            {buyer.isDemo ? <span className="listing-flag demo">Demo buyer</span> : null}
            {flags.map((badge) => (
              <span className="listing-flag" key={badge.type}>
                {badge.type === "PRE_APPROVED" ? "Pre-approved" : badge.label}
              </span>
            ))}
            {testPreApproval ? <span className="listing-flag unverified">{TEST_LABEL}</span> : null}
          </div>
        ) : null}
        <GeneratedAvatar className="listing-card-avatar" decorative name={buyer.name} seed={buyer.avatarSeed} variant={buyer.avatarVariant} />
      </div>
      <div className="listing-card-body">
        <p className="listing-card-price">{compactBudgetRange(buyer.budgetMin, buyer.budgetMax)}</p>
        <ul className="listing-card-facts" aria-label="Home needs">
          {facts.map((fact) => (
            <li key={fact.label}>
              <b>{fact.value}</b> {fact.label}
            </li>
          ))}
          <li className="listing-card-kind">{seekingLabel(buyer.purpose)}</li>
        </ul>
        <p className="listing-card-address">{buyer.location || "Liber service area"}</p>
        <FinancingLine preApproval={preApproval} testPreApproval={testPreApproval} />
        <p className="listing-card-fineprint">{fineprint}</p>
      </div>
      <Link aria-label={`View ${buyer.isDemo ? "demo buyer " : ""}${buyer.name} buyer profile`} className="listing-card-link" href={`/buyers/${buyer.id}`} />
    </article>
  );
}

function FinancingLine({ preApproval, testPreApproval }: { preApproval?: SellerBadgeDTO; testPreApproval?: SellerBadgeDTO }) {
  if (preApproval) {
    return (
      <p className="listing-card-financing verified">
        <Icon name="check-shield" size={14} />
        Pre-approved
        {typeof preApproval.expiresInDays === "number"
          ? ` · Expires in ${preApproval.expiresInDays} day${preApproval.expiresInDays === 1 ? "" : "s"}`
          : ""}
      </p>
    );
  }
  if (testPreApproval) {
    return (
      <p className="listing-card-financing unverified">
        <Icon name="info" size={14} />
        Test pre-approval · Not lender-verified
      </p>
    );
  }
  return <p className="listing-card-financing">Not pre-approved</p>;
}

function flagRank(type: string) {
  const rank = flagOrder.indexOf(type);
  return rank === -1 ? flagOrder.length : rank;
}
