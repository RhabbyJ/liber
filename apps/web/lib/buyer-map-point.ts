import type { SellerBuyerSearchDto } from "./buyer-dto-types";

export function approximateBuyerPoint(buyer: SellerBuyerSearchDto) {
  return {
    lat: buyer.mapPoint.latitude,
    lng: buyer.mapPoint.longitude,
  };
}
