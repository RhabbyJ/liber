import Image from "next/image";
import type { ArtworkMotion } from "./property-type-artwork";

type FlowIllustrationProps = {
  className?: string;
  motion?: ArtworkMotion;
};

export function PropertyHeroIllustration({
  className,
  motion = "float",
}: FlowIllustrationProps = {}) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={`property-intake-illustration${className ? ` ${className}` : ""}`}
      data-artwork-motion={motion}
      height={480}
      sizes="(max-width: 700px) 200px, 240px"
      src="/images/flows/property-intake-2d.webp"
      width={720}
    />
  );
}

export function OwnershipReviewIllustration({
  className,
  motion = "pulse",
}: FlowIllustrationProps = {}) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={`ownership-review-illustration${className ? ` ${className}` : ""}`}
      data-artwork-motion={motion}
      height={420}
      sizes="(max-width: 700px) 112px, 124px"
      src="/images/flows/ownership-review-2d.webp"
      width={420}
    />
  );
}
