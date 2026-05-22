import { NextResponse } from "next/server";
import { findPilotArea, sfvBoundingBox } from "../../../../lib/launch-market";

type GeocodeResult = {
  city: string;
  label: string;
  lat: number;
  lng: number;
  radiusMiles: number;
  state: "CA";
  zip: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() ?? "";
  const intent = searchParams.get("intent") === "store" ? "store" : "search";
  const kind = searchParams.get("kind") === "address" ? "address" : "place";

  if (query.length < 3) {
    return NextResponse.json({ error: "Enter at least 3 characters.", results: [] }, { status: 400 });
  }

  const localArea = findPilotArea(query);
  if (localArea) {
    return NextResponse.json({ error: null, results: [areaToResult(localArea)] });
  }

  const nextArea = findPilotArea(query, { includeNext: true });
  if (nextArea) {
    return NextResponse.json(
      { error: `${nextArea.label} is marked as a next pilot ZIP, not active yet.`, results: [] },
      { status: 422 },
    );
  }

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Mapbox is not configured.", results: [] }, { status: 503 });
  }

  const params = new URLSearchParams({
    access_token: token,
    bbox: sfvBoundingBox,
    country: "us",
    language: "en",
    limit: "3",
    permanent: intent === "store" ? "true" : "false",
    q: query,
    types: kind === "address" ? "address,postcode,place" : "postcode,place",
  });

  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Mapbox lookup failed.", results: [] }, { status: 502 });
  }

  const payload = await response.json();
  const results = (payload?.features ?? [])
    .map(featureToPilotResult)
    .filter((result: GeocodeResult | null): result is GeocodeResult => Boolean(result));

  if (results.length === 0) {
    return NextResponse.json({ error: "That area is outside the active pilot.", results: [] }, { status: 404 });
  }

  return NextResponse.json({ error: null, results });
}

function featureToPilotResult(feature: Record<string, any>) {
  const properties = feature.properties ?? {};
  const context = properties.context ?? {};
  const text = [
    properties.name,
    properties.full_address,
    properties.place_formatted,
    context.place?.name,
    context.postcode?.name,
  ].filter(Boolean).join(" ");
  const area = findPilotArea(text);
  if (!area) return null;

  return areaToResult(area);
}

function areaToResult(area: { city: string; label: string; lat: number; lng: number; radiusMiles: number; state: "CA"; zip: string }) {
  return {
    city: area.city,
    label: area.label,
    lat: area.lat,
    lng: area.lng,
    radiusMiles: area.radiusMiles,
    state: area.state,
    zip: area.zip,
  };
}
