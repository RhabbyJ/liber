"use client";

import { track } from "@/lib/track";
import { ArrowRight } from "./icons";
import { Placeholder } from "./ui";

export function ContactEmail({ email, channel, placeholder }: { email: string | null; channel: string; placeholder: string }) {
  if (!email) return <Placeholder label={placeholder} />;
  return (
    <a
      href={`mailto:${email}`}
      onClick={() => track({ name: "contact_click", props: { channel } })}
      className="inline-flex items-center gap-2 break-all font-bold text-teal-ink hover:underline"
    >
      {email} <ArrowRight />
    </a>
  );
}
