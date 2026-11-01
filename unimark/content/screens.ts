/**
 * Real UniMark app screens (from the App Store screenshots), processed by
 * `npm run images` into public/screens/<id>-<width>.webp.
 */
export const screens = {
  discover: {
    alt: "UniMark home screen: a search bar and a grid of student services, including piano lessons, grad photos, haircuts and calculus tutoring, each with a price.",
  },
  listing: {
    alt: "A Grad Photos listing showing a photo gallery, a $30 price, a description, and Make an offer and Contact Seller buttons.",
  },
  bookings: {
    alt: "The Bookings screen: a November calendar and a confirmed Grad Photos booking with Cancel and Reschedule buttons.",
  },
  profile: {
    alt: "A student profile with a short bio, a 5.0 star rating, social links, and the services they offer.",
  },
  "post-service": {
    alt: "The Post a Service screen with uploaded photos, a title and a description for a graduation photo service.",
  },
} as const;

export type ScreenId = keyof typeof screens;

export const SCREEN_WIDTHS = [360, 653] as const;
/** Intrinsic size of the largest rendition (width × height). */
export const SCREEN_SIZE = { width: 653, height: 1422 } as const;
