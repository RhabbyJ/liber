/**
 * Copy for the supporting pages. The About page deliberately has no founding
 * story or team section until approved copy is supplied.
 */

export const about = {
  meta: {
    title: "About",
    description: "UniMark makes it easier for students to discover each other’s skills, access useful services, and take part in their campus economy.",
  },
  eyebrow: "About UniMark",
  title: "Every campus is full of talent.",
  lead: "UniMark makes it easier for students to discover each other’s skills, access useful services, and take part in the economy of their own university community.",
  mission: {
    eyebrow: "Our mission",
    title: "Why we’re building UniMark",
    paragraphs: [
      "Students are surrounded by talent: classmates who tutor, take photos, cut hair, teach music and much more. But finding them usually depends on who you happen to know.",
      "UniMark brings those services together in one place, so students can find help from people in their own community, and students with skills can turn them into income.",
    ],
  },
  vision: {
    eyebrow: "Our vision",
    quote: "A campus where every student can find what they need, and earn from what they’re good at.",
  },
  principles: {
    eyebrow: "What we believe",
    title: "Built on a few simple ideas.",
    items: [
      { icon: "campus", title: "Student-first", body: "Every decision starts with what makes student life easier, from the services on offer to how the app works." },
      { icon: "people", title: "Community, not just transactions", body: "Working with another student is a chance to meet someone. We want UniMark to bring people closer." },
      {
        icon: "shield",
        title: "Independent",
        body: "UniMark is a student-focused company, not an official university service, and isn’t affiliated with or endorsed by any college or university.",
      },
    ],
  },
} as const;

export const partners = {
  meta: {
    title: "Partner with us",
    description: "Partner with UniMark to bring genuine value to college students through student discounts, sponsored benefits and local promotions.",
  },
  eyebrow: "Partner with UniMark",
  title: "Bring real value to student life.",
  lead: "We’re interested in collaborations that genuinely help students, and give your business a meaningful way to connect with them.",
  cta: "Start a conversation",
  ways: {
    eyebrow: "Ways to partner",
    title: "Ideas we’re excited about.",
    lead: "Have something else in mind? Tell us. If it’s good for students, we want to hear it.",
    items: [
      { icon: "discount", title: "Exclusive student discounts", body: "Special pricing or offers for students who use UniMark." },
      { icon: "gift", title: "Sponsored student benefits", body: "Perks, giveaways or resources that make student life a little easier." },
      { icon: "store", title: "Local business promotions", body: "Help students discover the shops, food and services around them." },
      { icon: "campus", title: "Campus-specific partnerships", body: "Promotions tailored to the needs of a particular student community." },
    ],
  },
  approach: {
    eyebrow: "How it works",
    title: "Students come first.",
    steps: [
      { title: "Tell us your idea", body: "Share a little about your business and the partnership you have in mind." },
      { title: "We review it with students in mind", body: "We only move forward with collaborations we believe students will genuinely value." },
      { title: "Shape it together", body: "If it’s a fit, we’ll work with you on the details." },
    ],
  },
  form: {
    eyebrow: "Partner inquiry",
    title: "Let’s talk.",
    lead: "Fill in the form and we’ll get back to you.",
    interests: ["Student discounts", "Sponsored student benefits", "Local business promotion", "Campus-specific partnership", "Something else"],
  },
} as const;

export const contact = {
  meta: {
    title: "Contact",
    description: "Get in touch with UniMark.",
  },
  eyebrow: "Contact",
  title: "Get in touch.",
  lead: "Questions, feedback or ideas? We’d love to hear from you.",
} as const;
