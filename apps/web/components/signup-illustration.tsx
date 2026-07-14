import Image from "next/image";
import type { ArtworkMotion } from "./property-type-artwork";

export type SignupRole = "buyer" | "seller" | "both";

const roleArtwork: Record<SignupRole, string> = {
  buyer: "/images/flows/signup-buyer-2d.webp",
  seller: "/images/flows/signup-seller-2d.webp",
  both: "/images/flows/signup-both-2d.webp",
};

export function SignupHeroIllustration({
  className,
  motion = "float",
}: {
  className?: string;
  motion?: ArtworkMotion;
} = {}) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={`signup-hero-illustration${className ? ` ${className}` : ""}`}
      data-artwork-motion={motion}
      height={400}
      sizes="(max-width: 640px) 154px, 190px"
      src="/images/flows/signup-hero-2d.webp"
      width={600}
    />
  );
}

export function SignupRoleIllustration({
  className,
  motion = "float",
  role,
}: {
  className?: string;
  motion?: ArtworkMotion;
  role: SignupRole;
}) {
  return (
    <span
      aria-hidden="true"
      className={`signup-role-art${className ? ` ${className}` : ""}`}
      data-artwork-motion={motion}
      data-signup-role={role}
    >
      <Image
        alt=""
        className="signup-role-illustration"
        height={384}
        sizes="(max-width: 640px) 58px, 68px"
        src={roleArtwork[role]}
        width={384}
      />
    </span>
  );
}
