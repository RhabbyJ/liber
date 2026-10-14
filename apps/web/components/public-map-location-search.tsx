"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ServiceArea } from "../lib/service-areas";
import { ServiceAreaCombobox } from "./service-area-combobox";
import { UnsupportedAreaState } from "./unsupported-area-state";

type Props = {
  defaultArea?: string;
  marketSlug: string;
};

export function PublicMapLocationSearch({ defaultArea = "", marketSlug }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const unsupportedArea = searchParams.get("unsupported") ?? "";
  const [dismissedUnsupported, setDismissedUnsupported] = useState("");
  const isUnsupported = Boolean(unsupportedArea) && dismissedUnsupported !== unsupportedArea;

  function navigate(update: (params: URLSearchParams) => void, replace = false) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("market", marketSlug);
    update(nextParams);
    const query = nextParams.toString();
    const path = query ? `/?${query}` : "/";
    if (replace) router.replace(path, { scroll: false });
    else router.push(path, { scroll: false });
  }

  function selectArea(area: ServiceArea) {
    navigate((params) => {
      params.set("area", area.slug);
      params.delete("unsupported");
    });
  }

  function clearArea() {
    setDismissedUnsupported(unsupportedArea);
    if (!searchParams.has("area") && !searchParams.has("unsupported")) return;
    navigate((params) => {
      params.delete("area");
      params.delete("unsupported");
    });
  }

  function showUnsupported(value: string) {
    navigate((params) => {
      params.delete("area");
      params.set("unsupported", value);
    }, true);
  }

  return (
    <div className="map-search-box public-map-search-box">
      <ServiceAreaCombobox
        ariaLabel="Search preview area by city, neighborhood, or ZIP"
        clearLabel="Clear preview area"
        defaultValue={unsupportedArea || defaultArea}
        inputId="public-map-area-search"
        marketSlug={marketSlug}
        onClear={clearArea}
        onNoMatch={showUnsupported}
        onQueryChange={() => setDismissedUnsupported(unsupportedArea)}
        onSelect={selectArea}
        submitClassName="public-map-search-submit"
        submitLabel="Search"
      />
      {isUnsupported ? <UnsupportedAreaState onSearchAnother={clearArea} /> : null}
    </div>
  );
}
