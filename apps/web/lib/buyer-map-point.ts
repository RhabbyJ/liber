export function approximateBuyerPoint(buyer: {
  lat: number;
  lng: number;
  primaryServiceArea?: { center: { lat: number; lng: number } };
  serviceAreaSlug?: string;
}) {
  if (buyer.primaryServiceArea?.center) return buyer.primaryServiceArea.center;
  return buyer.serviceAreaSlug && buyer.lat && buyer.lng ? { lat: buyer.lat, lng: buyer.lng } : null;
}
