import type { Buyer } from "./mock-data";

export function approximateBuyerPoint(buyer: Buyer) {
  if (buyer.primaryServiceArea) return buyer.primaryServiceArea.center;
  return {
    lat: roundCoordinate(buyer.lat),
    lng: roundCoordinate(buyer.lng),
  };
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(2));
}
