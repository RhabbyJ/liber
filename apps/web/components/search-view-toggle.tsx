"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";

/**
 * Narrow-screen floating Map / List control. The results sheet scrolls over a
 * sticky map; this pill jumps between the two views.
 */
export function SearchViewToggle({ resultsId }: { resultsId: string }) {
  const [showsMap, setShowsMap] = useState(true);

  useEffect(() => {
    const results = document.getElementById(resultsId);
    if (!results) return;
    const update = () => {
      setShowsMap(results.getBoundingClientRect().top > window.innerHeight * 0.55);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [resultsId]);

  function toggle() {
    const results = document.getElementById(resultsId);
    if (!results) return;
    if (showsMap) {
      const offset = results.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ behavior: "smooth", top: Math.max(0, offset) });
      return;
    }
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  return (
    <button className="search-view-toggle" onClick={toggle} type="button">
      <Icon name={showsMap ? "list" : "map"} size={18} />
      {showsMap ? "List" : "Map"}
    </button>
  );
}
