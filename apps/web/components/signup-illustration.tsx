type SignupRole = "buyer" | "seller" | "both";

export function SignupHeroIllustration() {
  return (
    <svg
      aria-hidden="true"
      className="signup-hero-illustration"
      focusable="false"
      viewBox="0 0 220 128"
    >
      <path
        d="M31 91 45 34l74-18 66 29-10 58-83 12Z"
        fill="var(--sage-tint)"
        stroke="var(--sage-line)"
        strokeDasharray="5 5"
      />
      <path d="M51 96c25-7 48-7 69-2 18 5 35 5 52 1" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
      <path d="m72 66 30-25 31 25" fill="var(--sage-strong)" stroke="var(--sage-deep)" strokeLinejoin="round" strokeWidth="3" />
      <path d="M80 63h46v34H80z" fill="#fff" stroke="var(--ink-strong)" strokeLinejoin="round" strokeWidth="2.5" />
      <path d="M98 76h11v21H98z" fill="var(--sage-tint-strong)" stroke="var(--sage-deep)" strokeWidth="2" />
      <path d="M85 73h9v9h-9zm28 0h9v9h-9z" fill="var(--sage-tint)" stroke="var(--sage-strong)" strokeWidth="1.5" />
      <path d="M139 44v52" stroke="var(--ink-faint)" strokeDasharray="3 4" strokeWidth="2" />
      <rect x="132" y="59" width="15" height="13" rx="4" fill="#fff" stroke="var(--ink-strong)" strokeWidth="2" />
      <path d="M136 59v-3a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="var(--ink-strong)" strokeWidth="2" />
      <path d="M147 78c12-9 22-11 33-8" fill="none" stroke="var(--sage-line)" strokeDasharray="3 4" strokeWidth="2" />
      <g>
        <circle cx="164" cy="56" r="14" fill="var(--sage-tint-strong)" stroke="var(--sage-line)" />
        <circle cx="164" cy="56" r="5" fill="var(--sage-strong)" stroke="#fff" strokeWidth="2" />
        <circle cx="187" cy="76" r="11" fill="var(--sage-tint-strong)" stroke="var(--sage-line)" />
        <circle cx="187" cy="76" r="4" fill="var(--sage-deep)" stroke="#fff" strokeWidth="2" />
        <circle cx="159" cy="91" r="9" fill="var(--sage-tint)" stroke="var(--sage-line)" />
        <circle cx="159" cy="91" r="3.5" fill="var(--sage-strong)" />
      </g>
    </svg>
  );
}

export function SignupRoleIllustration({ role }: { role: SignupRole }) {
  if (role === "buyer") {
    return (
      <svg aria-hidden="true" className="signup-role-illustration" focusable="false" viewBox="0 0 66 48">
        <circle cx="13" cy="24" r="10" fill="var(--sage-tint-strong)" stroke="var(--sage-line)" />
        <circle cx="13" cy="24" r="4" fill="var(--sage-strong)" />
        <path d="M24 24h10" stroke="var(--sage-deep)" strokeDasharray="2 3" strokeWidth="2" />
        <path d="m36 23 10-9 11 9" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2.5" />
        <path d="M39 22h16v13H39z" fill="#fff" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M46 28h4v7h-4z" fill="var(--sage-tint-strong)" />
      </svg>
    );
  }

  if (role === "seller") {
    return (
      <svg aria-hidden="true" className="signup-role-illustration" focusable="false" viewBox="0 0 66 48">
        <path d="m8 23 11-9 11 9" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2.5" />
        <path d="M11 22h16v13H11z" fill="#fff" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M30 24c9-8 18-8 27 0" fill="none" stroke="var(--sage-line)" strokeWidth="2" />
        <circle cx="41" cy="18" r="5" fill="var(--sage-tint-strong)" stroke="var(--sage-line)" />
        <circle cx="41" cy="18" r="2" fill="var(--sage-strong)" />
        <circle cx="55" cy="25" r="6" fill="var(--sage-tint-strong)" stroke="var(--sage-line)" />
        <circle cx="55" cy="25" r="2.5" fill="var(--sage-deep)" />
        <circle cx="43" cy="34" r="4.5" fill="var(--sage-tint)" stroke="var(--sage-line)" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="signup-role-illustration" focusable="false" viewBox="0 0 66 48">
      <rect x="7" y="11" width="23" height="27" rx="6" fill="var(--sage-tint)" stroke="var(--sage-line)" strokeWidth="2" />
      <circle cx="18.5" cy="20" r="4" fill="var(--sage-strong)" />
      <path d="M13 29h11" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <rect x="36" y="11" width="23" height="27" rx="6" fill="#fff" stroke="currentColor" strokeWidth="2" />
      <path d="m41 25 6.5-6 6.5 6" fill="none" stroke="var(--sage-deep)" strokeLinejoin="round" strokeWidth="2" />
      <path d="M43 24h9v7h-9z" fill="var(--sage-tint-strong)" stroke="var(--sage-deep)" strokeWidth="1.5" />
      <path d="M29 24h8" stroke="var(--sage-strong)" strokeDasharray="2 2" strokeWidth="2" />
    </svg>
  );
}
