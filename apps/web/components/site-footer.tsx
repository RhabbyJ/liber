import Link from "next/link";

const footerLinks = [
  { href: "/", label: "Buyer demand map" },
  { href: "/seller/search", label: "Find buyers" },
  { href: "/seller/properties", label: "Private properties" },
  { href: "/seller/invites", label: "Sent invites" },
  { href: "/buyer/profile", label: "Create a buyer profile" },
  { href: "/buyer/badges", label: "Get verified" },
  { href: "/buyer/invites", label: "Received invites" },
  { href: "/login", label: "Log in" },
  { href: "/signup", label: "Create an account" },
];

const legalLines = [
  "Liber is a private directory of buyer demand. Properties stay private and outreach is manual.",
  "Liber is not an escrow, lender, or transaction execution service. No offers, no escrow, no payments.",
];

export function SiteFooter({ variant = "full" }: { variant?: "compact" | "full" }) {
  if (variant === "compact") {
    return (
      <footer className="site-footer compact">
        <nav aria-label="Footer" className="site-footer-compact-links">
          {footerLinks.map((link) => (
            <Link href={link.href} key={`${link.href}-${link.label}`}>{link.label}</Link>
          ))}
        </nav>
        {legalLines.map((line) => <p key={line}>{line}</p>)}
        <p className="site-footer-copyright">© 2026 Liber</p>
      </footer>
    );
  }

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <nav aria-label="Footer" className="site-footer-links">
          {footerLinks.map((link) => (
            <Link href={link.href} key={`${link.href}-${link.label}`}>{link.label}</Link>
          ))}
        </nav>
        <div className="site-footer-legal">
          {legalLines.map((line) => <p key={line}>{line}</p>)}
        </div>
        <p className="site-footer-brandline">
          <span className="brand-mark" aria-hidden="true" />
          <span>© 2026 Liber · Private buyer directory</span>
        </p>
      </div>
      <FooterSkyline />
    </footer>
  );
}

function FooterSkyline() {
  return (
    <svg aria-hidden="true" className="site-footer-skyline" focusable="false" preserveAspectRatio="xMidYMax slice" viewBox="0 0 1440 120">
      <path d="M0 96c90-26 170-34 250-20s150 18 230 0 170-44 260-30 170 40 250 34 160-30 250-34 140 6 200 18v56H0z" fill="#e0f6d8" />
      <path d="M0 108c120-16 230-18 330-8s210 14 320 0 230-22 340-12 210 18 300 10 110-10 150-8v30H0z" fill="#bceaad" opacity="0.7" />
      <g fill="none" stroke="#47a62f" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M156 106V72l26-20 26 20v34M174 106V88h16v18M150 76l32-26 32 26" />
        <path d="M392 106V64h52v42M384 68l34-24 34 24M404 80h12M426 80h12M404 94h12" />
        <path d="M700 106V58l34-26 34 26v48M718 106V86h32v20M692 62l42-34 42 34M714 70h40" />
        <path d="M1010 106V76h64v30M1002 80l40-28 40 28M1030 106V90h12v16" />
        <path d="M1240 106V70l24-18 24 18v36M1234 74l30-24 30 24" />
        <path d="M282 106c0-22 2-40 6-56M288 50c-10-2-20 4-24 12M288 50c8-6 20-6 26 2M288 50c-2-8-10-14-18-14M288 50c4-8 14-12 22-8" />
        <path d="M884 106c0-24 2-44 7-62M891 44c-11-2-21 5-25 13M891 44c9-7 21-7 28 2M891 44c-2-9-11-15-19-15M891 44c4-9 15-13 23-9" />
        <path d="M1356 106c0-20 2-36 5-50M1361 56c-9-2-18 4-21 11M1361 56c7-6 18-6 23 2M1361 56c-1-8-9-13-16-13" />
      </g>
    </svg>
  );
}
