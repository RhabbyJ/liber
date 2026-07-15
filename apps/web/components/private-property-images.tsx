"use client";

import { useEffect, useState } from "react";

export function PrivatePropertyImages({ imageIds }: { imageIds: string[] }) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [urlsById, setUrlsById] = useState<Record<string, string>>({});
  const imageIdsKey = imageIds.join("\u001f");
  useEffect(() => {
    const retry = () => setRetryVersion((value) => value + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  useEffect(() => {
    const requestedIds = imageIdsKey ? imageIdsKey.split("\u001f") : [];
    const controller = new AbortController();
    let cancelled = false;
    void Promise.all(requestedIds.map(async (imageId) => {
      try {
        const response = await fetch(`/api/property-images/${encodeURIComponent(imageId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return null;
        const data = await response.json() as { signedUrl?: string };
        return data.signedUrl ? [imageId, data.signedUrl] as const : null;
      } catch {
        return null;
      }
    })).then((items) => {
      if (!cancelled) setUrlsById(Object.fromEntries(items.filter((item) => item !== null)));
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [imageIdsKey, retryVersion]);

  const images = imageIds.flatMap((imageId) => {
    const url = urlsById[imageId];
    return url ? [{ id: imageId, url }] : [];
  });

  if (images.length === 0) return null;
  return (
    <div className="grid three" aria-label="Private property images">
      {images.map(({ id, url }) => (
        // eslint-disable-next-line @next/next/no-img-element -- Keep invite-gated signed URLs browser-direct.
        <img alt="Invited property" key={id} src={url} style={{ borderRadius: 12, width: "100%" }} />
      ))}
    </div>
  );
}
