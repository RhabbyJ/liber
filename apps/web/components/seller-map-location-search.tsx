"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ServiceArea } from "../lib/service-areas";
import { ServiceAreaCombobox } from "./service-area-combobox";

type Props = {
  defaultArea?: string;
  marketSlug: string;
};

export function SellerMapLocationSearch({ defaultArea = "", marketSlug }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(serviceAreaSlug: string | null) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("market", marketSlug);
    if (serviceAreaSlug) nextParams.set("serviceArea", serviceAreaSlug);
    else nextParams.delete("serviceArea");
    nextParams.delete("cursor");
    removeLegacyGeographyParams(nextParams);
    const query = nextParams.toString();
    router.push(query ? `/seller/search?${query}` : "/seller/search", { scroll: false });
  }

  return (
    <div className="seller-map-search">
      <ServiceAreaCombobox
        ariaLabel="Search buyer demand by city, neighborhood, or ZIP"
        defaultValue={defaultArea}
        inputId="seller-map-area-search"
        marketSlug={marketSlug}
        onClear={() => {
          if (searchParams.has("serviceArea")) navigate(null);
        }}
        onSelect={(area: ServiceArea) => navigate(area.slug)}
        submitClassName="button primary"
        submitLabel="Search"
      />
    </div>
  );
}

function removeLegacyGeographyParams(params: URLSearchParams) {
  for (const key of ["area", "centerLat", "centerLng", "city", "radiusMiles", "state"]) {
    params.delete(key);
  }
}
