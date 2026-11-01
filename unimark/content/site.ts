/**
 * Central site configuration: brand, links, contact details and SEO.
 *
 * Values set to `null` are not yet supplied. They render as clearly labelled
 * placeholders (or are hidden), and `npm run check:launch` fails until each one
 * is filled in or deliberately left out.
 */

export type StoreId = "ios" | "android";

export const site = {
  name: "UniMark",
  tagline: "Your Campus. Your Marketplace.",
  description:
    "UniMark is a student-to-student services marketplace. Discover services from students around you, or turn your skills into income.",

  /** Public site URL without trailing slash. Set NEXT_PUBLIC_SITE_URL at build time. */
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || null,

  stores: {
    ios: {
      label: "App Store",
      cta: "Download on the App Store",
      device: "iPhone",
      url: "https://apps.apple.com/us/app/uni-mark/id6478984557",
      appId: "6478984557",
    },
    android: {
      label: "Google Play",
      cta: "Get it on Google Play",
      device: "Android",
      url: "https://play.google.com/store/apps/details?id=com.unimark.unimark",
      appId: "com.unimark.unimark",
    },
  },

  /**
   * Official store badge artwork, served from /public. Apple and Google require
   * their unmodified badges; until the files are added, the site shows plain
   * text buttons instead of imitation badges.
   *   App Store:   https://developer.apple.com/app-store/marketing/guidelines/
   *   Google Play: https://play.google.com/intl/en_us/badges/
   */
  badges: {
    ios: null as string | null, // e.g. "/badges/app-store.svg"
    android: null as string | null, // e.g. "/badges/google-play.svg"
  },

  contact: {
    /** General questions. */
    generalEmail: null as string | null,
    /** App help for students. */
    supportEmail: null as string | null,
    /** Receives partner inquiries when no form endpoint is configured. */
    partnerEmail: null as string | null,
  },

  /**
   * Optional form service endpoint (e.g. Formspree, Basin, Getform) that accepts
   * a JSON POST. When set, partner inquiries are submitted there; otherwise the
   * form opens a pre-filled email to `contact.partnerEmail`.
   */
  partnerFormEndpoint: null as string | null,

  /** Social profiles. Leave empty to hide the social links. */
  socials: [] as { label: string; url: string }[],

  /** Legal pages. Links stay hidden until the documents are supplied. */
  legal: {
    privacy: null as string | null,
    terms: null as string | null,
    communityGuidelines: null as string | null,
  },

  independenceNote:
    "UniMark is an independent, student-focused company. It is not affiliated with, or endorsed by, any college or university.",
} as const;

export const nav = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "For students", href: "/#for-students" },
  { label: "About", href: "/about/" },
  { label: "Partner with us", href: "/partners/" },
] as const;
