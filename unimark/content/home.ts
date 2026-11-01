/**
 * Homepage copy. Edit text here; layout lives in components/home/.
 *
 * Product statements are limited to what the supplied app screenshots show
 * (search, listings with prices and photos, offers, contacting sellers,
 * booking requests, profiles with ratings, posting a service). UniMark does
 * not process payments; students arrange payment directly.
 */
import type { ScreenId } from "./screens";

export const hero = {
  eyebrow: "Student services marketplace",
  titleLead: "Your Campus.",
  titleAccent: "Your Marketplace.",
  lead: "Discover services from students around you, or turn your skills into income.",
  secondaryCta: { label: "See how it works", href: "#how-it-works" },
};

export const twoSides = {
  eyebrow: "Two ways to use UniMark",
  title: "Find what you need. Offer what you’re good at.",
  lead: "One app for both sides of campus life: students who need a hand, and students with skills to share.",
  find: {
    label: "For students looking for services",
    title: "Find a service",
    body: "Need a haircut before an interview, help with calculus, or photos for graduation? Find students around you who offer exactly that.",
    points: [
      "Discover talent in your campus community",
      "Compare listings, photos, prices and ratings",
      "Contact providers directly or make an offer",
      "Request a time that works for you",
    ],
    cta: "Find a service",
    screen: "discover" as ScreenId,
  },
  offer: {
    label: "For students offering services",
    title: "Offer a service",
    body: "Good with a camera, clippers or a calculator? List what you do well and connect with students who need it.",
    points: [
      "List your skills with photos and a price",
      "Reach students looking for what you offer",
      "Manage booking requests in one place",
      "Build a reputation with ratings on your profile",
    ],
    cta: "Start offering",
    screen: "post-service" as ScreenId,
  },
};

export const howItWorks = {
  eyebrow: "How it works",
  title: "Three steps. That’s it.",
  tabs: [
    {
      id: "find",
      label: "Finding a service",
      steps: [
        { title: "Discover services", body: "Browse what students around you offer, by price and availability. Save the ones you like." },
        { title: "Connect with a provider", body: "Check their profile and ratings, then contact them or make an offer in the app." },
        {
          title: "Arrange the service",
          body: "Choose a time and send a booking request. You agree on the details, including payment, directly with each other.",
        },
      ],
    },
    {
      id: "offer",
      label: "Offering a service",
      steps: [
        { title: "Create your listing", body: "Add photos, a title, a description and your price. Your listing is ready to be discovered." },
        { title: "Connect with customers", body: "Students reach out, make offers and send booking requests you can confirm or reschedule." },
        { title: "Deliver and build your reputation", body: "Do great work, collect ratings on your profile, and grow with every student you help." },
      ],
    },
  ],
};

export const showcase = {
  eyebrow: "Inside the app",
  title: "Everything happens in the app.",
  lead: "Real screens from UniMark for iPhone and Android.",
  items: [
    {
      screen: "discover" as ScreenId,
      kicker: "Discover",
      title: "Your Campus, Connected",
      body: "Discover what students around you can offer. Search services and save your favorites for later.",
    },
    {
      screen: "listing" as ScreenId,
      kicker: "Listings",
      title: "Find Exactly What You Need",
      body: "Every listing shows photos, a clear price and a description. Make an offer or contact the seller in a tap.",
    },
    {
      screen: "bookings" as ScreenId,
      kicker: "Bookings",
      title: "Book in a Few Taps",
      body: "Choose a time, send a request, and connect. Keep track of incoming and outgoing bookings on one calendar.",
    },
    {
      screen: "profile" as ScreenId,
      kicker: "Profiles & ratings",
      title: "Built Around Student Life",
      body: "Profiles show who you’re working with: a short bio, ratings, social links and every service they offer.",
    },
    {
      screen: "post-service" as ScreenId,
      kicker: "Post a service",
      title: "Turn Your Skills into Income",
      body: "Create a listing with photos, a title and a description, and start earning from what you know.",
    },
  ],
};

export const why = {
  eyebrow: "Why UniMark",
  title: "Made for the way students live.",
  lead: "A marketplace built around campus life, where the person who can help is often someone you already pass between classes.",
  items: [
    {
      icon: "community",
      title: "Talent within your campus community",
      body: "Classmates tutor, shoot photos, cut hair and teach music. UniMark helps you find them.",
    },
    { icon: "income", title: "Turn skills into income", body: "Offer what you’re good at and set your own price for it." },
    { icon: "people", title: "Build real relationships", body: "Every service is a chance to meet another student, not just complete a transaction." },
    { icon: "spark", title: "Services that fit student life", body: "From grad photos to exam prep, listings are shaped by what students actually need." },
    { icon: "shield", title: "Choose with confidence", body: "Profiles, photos and ratings help you decide who to work with before you reach out." },
  ],
} as const;

export const partnerTeaser = {
  eyebrow: "For businesses",
  title: "Have something students will love?",
  body: "We partner with businesses that bring genuine value to student life, like exclusive discounts and local perks.",
  cta: "Partner with us",
};

export const download = {
  title: "Your Campus Is Full of Talent. Discover It.",
  body: "Download UniMark to find services from students around you, or start offering your own.",
};
