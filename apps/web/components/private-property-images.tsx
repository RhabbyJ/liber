"use client";

import { useEffect, useState } from "react";

export function PrivatePropertyImages({ imageIds }: { imageIds: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(imageIds.map(async (imageId) => {
      const response = await fetch(`/api/property-images/${encodeURIComponent(imageId)}`, { cache: "no-store" });
      if (!response.ok) return null;
      const data = await response.json() as { signedUrl?: string };
      return data.signedUrl ?? null;
    })).then((items) => {
      if (!cancelled) setUrls(items.filter((item): item is string => Boolean(item)));
    });
    return () => { cancelled = true; };
  }, [imageIds]);

  if (urls.length === 0) return null;
  return (
    <div className="grid three" aria-label="Private property images">
      {urls.map((url) => <img alt="Invited property" key={url} src={url} style={{ borderRadius: 12, width: "100%" }} />)}
    </div>
  );
}
