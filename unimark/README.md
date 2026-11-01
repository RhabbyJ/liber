# UniMark website

Marketing site for UniMark, the student-to-student services marketplace. It introduces the product and sends visitors to the iOS and Android apps. There is no backend: `npm run build` produces a folder of static files that can be hosted anywhere.

Built with Next.js 16 (App Router, static export), React 19, TypeScript and Tailwind CSS 4.

## Quick start

Requires Node.js 20.9 or newer (22 LTS recommended; see `.nvmrc`).

```bash
npm ci
npm run dev        # http://localhost:3000
```

## Build and deploy

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.com npm run build
npm run check:launch   # fails until all launch content is in place
npm run preview        # serves out/ at http://localhost:4173
```

The complete site is written to **`out/`**. Upload its contents to any static host:

| Host | Setup |
| --- | --- |
| Vercel | Import the folder as a project (framework: Next.js). Set `NEXT_PUBLIC_SITE_URL` in project settings. |
| Netlify / Cloudflare Pages | Build command `npm run build`, publish directory `out`. |
| S3 + CloudFront, Azure Static Web Apps, etc. | Upload `out/`; set the error document to `404.html`. |
| Nginx / Apache / cPanel | Copy `out/` to the web root. Pages are `folder/index.html`, so no rewrite rules are needed. Point 404s at `/404.html`. |

`NEXT_PUBLIC_SITE_URL` (see `.env.example`) is used for canonical URLs, the sitemap and social sharing cards. Set it to the final domain, without a trailing slash.

Recommended response headers on the host: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and long-lived caching for `/_next/static/*` (file names are content-hashed).

## Before launch

`npm run check:launch` (after a build) lists what is still missing. Placeholders are visible on the page with a yellow **Placeholder** label so they are never mistaken for final content. Currently outstanding:

- Final domain (`NEXT_PUBLIC_SITE_URL`)
- Contact emails and a partner-inquiry destination (`content/site.ts`)
- Privacy Policy, Terms of Service and Community Guidelines links (`content/site.ts` → `legal`)
- Optional: official App Store / Google Play badge files, social profile links

## Editing content

All copy and settings live in `content/`. Layout code does not need to change for routine edits.

| File | What it controls |
| --- | --- |
| `content/site.ts` | Brand name, store links, badges, contact emails, partner form endpoint, social links, legal links, navigation |
| `content/home.ts` | Homepage copy, section by section |
| `content/pages.ts` | About, Partners and Contact page copy |
| `content/screens.ts` | App screenshot alt text |

**Store badges.** Apple and Google require their unmodified badge artwork. Download it from [Apple](https://developer.apple.com/app-store/marketing/guidelines/) and [Google](https://play.google.com/intl/en_us/badges/), save it to `public/badges/`, and set `site.badges.ios` / `site.badges.android` to the file paths. Until then the site shows plain "Download for iPhone/Android" buttons.

**Partner inquiries.** Set `site.partnerFormEndpoint` to any form service that accepts a JSON POST (Formspree, Basin, Getform…) to receive submissions directly, or set `site.contact.partnerEmail` to have the form open a pre-filled email instead.

**Legal pages.** Set each `site.legal` entry to a URL (an external page, or a new route under `app/`). The footer shows a Legal column once any entry is set.

## App screenshots

Source images live in `assets/screens-src/`. After adding or replacing one, run:

```bash
npm run images
```

This crops the phone screen out of the App Store frames (921×2000), bakes in the rounded corners, writes two WebP sizes to `public/screens/`, and regenerates the app icons. Plain device screenshots (no frame) are used uncropped. A new screen also needs an entry in `content/screens.ts`.

## Analytics

`lib/track.ts` emits conversion events without bundling any analytics vendor. Add your tag (GA4/Google Tag Manager, Plausible, Meta Pixel…) in `app/layout.tsx` and the events flow automatically:

| Event | When | Properties |
| --- | --- | --- |
| `download_click` | A store button is clicked | `store` (`ios`/`android`), `placement` |
| `get_app_redirect` | A phone visiting `/get/` is sent to its store | `store` |
| `cta_click` | Internal calls to action | `id`, `placement` |
| `partner_inquiry_submit` | Partner form submitted | `method`, `type` |
| `contact_click` | Contact email clicked | `channel` |

Events go to `window.dataLayer`, `window.plausible`, and a `unimark:track` DOM event.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Homepage: hero, find/offer, how it works, app showcase, why UniMark, partner teaser, download |
| `/about/` | Mission, vision and principles |
| `/partners/` | Partnership ideas and inquiry form |
| `/contact/` | Contact options |
| `/get/` | Smart download link for bios, posters and QR codes: phones go straight to their store |
| `/404.html` | Not found |

## Project structure

```
app/            Routes, layout, global styles and design tokens (globals.css), sitemap, robots, social card (og.png)
components/     UI components; components/home/ holds the homepage sections
components/brand/  Official logo outlines extracted from the brand guide
content/        Editable copy and settings
lib/            Analytics hook and metadata helper
public/brand/   Logo files (SVG) for reuse elsewhere
public/screens/ Processed app screenshots (generated)
assets/         Source screenshots
scripts/        images, preview, launch check, visual QA screenshots
```

## Design system

Tokens are defined in `app/globals.css` (`@theme`): brand colors (Warm Teal `#00AAB2`, Dark `#1B1C28`, Light `#F7F7F7`), type scale (`text-display`, `text-h1`, `text-h2`, `text-h3`, `text-lead`), buttons (`btn` + `btn-primary` / `btn-dark` / `btn-light` / `btn-ghost-*`), radii, shadows and motion. Typeface: Montserrat (SIL Open Font License), self-hosted.

Text-on-color pairs meet WCAG AA. White text on Warm Teal does not (2.8:1), so teal buttons use dark text, and teal text on light backgrounds uses `teal-ink` (`#007A80`).

## Quality checks

```bash
npm run check          # typecheck + lint + build
npm run check:launch   # launch content
node scripts/screenshot.mjs http://localhost:4173 .qa   # full-page screenshots at phone/tablet/desktop (needs Playwright)
```

Motion respects `prefers-reduced-motion`. Content is visible without JavaScript.
