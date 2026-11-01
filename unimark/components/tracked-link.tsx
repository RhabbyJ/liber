"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { track } from "@/lib/track";

type TrackedLinkProps = ComponentProps<typeof Link> & {
  /** Identifies the call to action in analytics, e.g. "find-service". */
  ctaId: string;
  placement: string;
};

/** Internal link that reports a `cta_click` event before navigating. */
export function TrackedLink({ ctaId, placement, onClick, ...props }: TrackedLinkProps) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        track({ name: "cta_click", props: { id: ctaId, placement } });
        onClick?.(e);
      }}
    />
  );
}
