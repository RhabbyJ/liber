"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function ViewToggle({ currentView }: { currentView: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleToggle = (view: "list" | "map") => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("view", view);
    router.push(`/seller/search?${nextParams.toString()}`);
  };

  return (
    <div className="view-toggle-container" role="group" aria-label="Search view toggle">
      <button
        type="button"
        className={`view-toggle-btn ${currentView === "list" ? "active" : ""}`}
        onClick={() => handleToggle("list")}
      >
        List
      </button>
      <button
        type="button"
        className={`view-toggle-btn ${currentView === "map" ? "active" : ""}`}
        onClick={() => handleToggle("map")}
      >
        Map
      </button>
    </div>
  );
}
