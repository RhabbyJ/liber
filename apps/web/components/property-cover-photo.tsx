"use client";

import { useEffect, useState } from "react";
import { PropertyTypeArtwork } from "./property-type-artwork";

/**
 * A seller's own property media: their first uploaded photo (signed through the
 * authorized image route), or a clearly labelled sample photo of the property type.
 */
export function PropertyCoverPhoto({
  className,
  imageId,
  priority = false,
  propertyType,
  seed,
  showSampleTag = true,
  sizes,
}: {
  className?: string;
  imageId?: string;
  priority?: boolean;
  propertyType: string;
  seed: string;
  /** Thumbnails skip the label; larger media always say when the photo is a sample. */
  showSampleTag?: boolean;
  sizes: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!imageId) return;
    const controller = new AbortController();
    void fetch(`/api/property-images/${encodeURIComponent(imageId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = response.ok ? await response.json() as { signedUrl?: string } : null;
        if (data?.signedUrl) setUrl(data.signedUrl);
        else setFailed(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [imageId]);

  if (imageId && !failed) {
    return (
      <span aria-hidden="true" className={`property-type-artwork property-cover-photo${url ? " loaded" : ""}${className ? ` ${className}` : ""}`}>
        {/* Signed URLs stay browser-direct and expire quickly; next/image would cache them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img alt="" className="property-type-artwork-image" onError={() => setFailed(true)} src={url} /> : null}
      </span>
    );
  }

  return (
    <>
      <PropertyTypeArtwork className={className} priority={priority} seed={seed} sizes={sizes} value={propertyType} />
      {showSampleTag ? <span className="sample-photo-tag">Sample photo</span> : null}
    </>
  );
}
