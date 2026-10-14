import Image from "next/image";

/** Hero photograph for the add-property banner (a generated photo of no real address). */
export function PropertyHeroIllustration({ className }: { className?: string } = {}) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={`property-intake-photo${className ? ` ${className}` : ""}`}
      fill
      priority
      sizes="(max-width: 860px) 100vw, 800px"
      src="/images/homes/house-3.webp"
    />
  );
}
