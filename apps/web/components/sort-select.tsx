"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("sort", e.target.value);
    nextParams.delete("cursor");
    router.push(`/seller/search?${nextParams.toString()}`);
  };

  return (
    <div className="sort-select-wrapper">
      <span aria-hidden="true">Sort:</span>
      <select value={value} onChange={handleChange} aria-label="Sort buyers">
        <option value="recommended">Best match</option>
        <option value="recently_active">Recently active</option>
        <option value="highest_budget">Highest budget</option>
        <option value="most_verified">Most verified</option>
      </select>
    </div>
  );
}
