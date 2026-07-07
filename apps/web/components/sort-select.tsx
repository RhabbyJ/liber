"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("sort", e.target.value);
    router.push(`/seller/search?${nextParams.toString()}`);
  };

  return (
    <div className="sort-select-wrapper">
      <span>Sort By</span>
      <select value={value} onChange={handleChange} aria-label="Sort buyers list">
        <option value="recommended">best match</option>
        <option value="recently_active">recently active</option>
        <option value="highest_budget">highest budget</option>
        <option value="most_verified">most verified</option>
      </select>
    </div>
  );
}
