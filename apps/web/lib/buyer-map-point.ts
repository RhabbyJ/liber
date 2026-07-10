import type { Buyer } from "./mock-data";

export function approximateBuyerPoint(buyer: Buyer) {
  return buyer.primaryServiceArea?.center ?? null;
}
