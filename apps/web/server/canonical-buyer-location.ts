type SelectedServiceArea = {
  active: boolean;
  centerLat: number;
  centerLng: number;
  city: string | null;
  label: string;
  market: { active: boolean };
  postalCode: string | null;
  state: string;
  type: string;
};

export function buyerLocationFromSelectedServiceArea(area: SelectedServiceArea | null | undefined) {
  if (!area) {
    return {
      active: false,
      city: "",
      lat: 0,
      lng: 0,
      location: "",
      neighborhood: undefined,
      postalCode: undefined,
      state: "",
    };
  }

  const city = area.type === "neighborhood" ? area.label : area.city ?? area.label;
  return {
    active: area.active && area.market.active,
    city,
    lat: area.centerLat,
    lng: area.centerLng,
    location: area.type === "zip" && area.postalCode
      ? `${city}, ${area.state} ${area.postalCode}`
      : `${area.label}, ${area.state}`,
    neighborhood: area.type === "neighborhood" ? area.label : undefined,
    postalCode: area.postalCode ?? undefined,
    state: area.state,
  };
}
