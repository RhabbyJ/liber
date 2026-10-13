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
