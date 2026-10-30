import type { SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { sellerCardView } from "../lib/buyer-card-view";
import { BuyerDemandCard } from "./buyer-demand-card";

/** Approved-seller result card; links to the full buyer profile. */
export function BuyerCard({ buyer }: { buyer: SellerBuyerSummaryDTO }) {
  return <BuyerDemandCard buyerId={buyer.id} view={sellerCardView(buyer)} />;
}
