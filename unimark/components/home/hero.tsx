import { hero } from "@/content/home";
import type { ScreenId } from "@/content/screens";
import { ArrowRight } from "../icons";
import { Phone } from "../phone";
import { StoreButtons } from "../store-buttons";
import { Eyebrow } from "../ui";

// Fan of real app screens. Outer phones only appear on wide screens.
const FAN: { screen: ScreenId; className: string; delay: number; float: string; wideOnly?: boolean }[] = [
  { screen: "post-service", className: "left-[1%] top-[24%] w-[17%] -rotate-[12deg]", delay: 520, float: "-1s", wideOnly: true },
  { screen: "listing", className: "left-[-4%] top-[14%] w-[40%] -rotate-[7deg] sm:left-[3%] md:left-[19%] md:w-[22%]", delay: 420, float: "-2.5s" },
  { screen: "bookings", className: "right-[-4%] top-[14%] w-[40%] rotate-[7deg] sm:right-[3%] md:right-[19%] md:w-[22%]", delay: 460, float: "-4.5s" },
  { screen: "profile", className: "right-[1%] top-[24%] w-[17%] rotate-[12deg]", delay: 560, float: "-3.5s", wideOnly: true },
];

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-ink text-white">
      <div className="bg-dots absolute inset-0 -z-10" aria-hidden="true" />
      <div
        className="absolute bottom-[-10rem] left-1/2 -z-10 h-[36rem] w-[min(60rem,120vw)] -translate-x-1/2 rounded-full bg-teal/20 blur-[120px]"
        aria-hidden="true"
      />

      <div className="container-site flex flex-col items-center pt-28 text-center sm:pt-36 lg:pt-40">
        <div className="animate-rise">
          <Eyebrow tone="dark">{hero.eyebrow}</Eyebrow>
        </div>
        <h1 id="hero-title" className="text-display mt-6 max-w-[15ch] animate-lift [animation-delay:80ms] md:max-w-none">
          {hero.titleLead} <span className="text-teal md:block">{hero.titleAccent}</span>
        </h1>
        <p className="text-lead mt-6 max-w-[34rem] text-white/75 animate-lift [animation-delay:160ms]">{hero.lead}</p>
        <div className="mt-9 flex w-full flex-col items-center gap-5 animate-rise [animation-delay:240ms] sm:w-auto">
          <StoreButtons
            placement="hero"
            variant="light"
            className="w-full flex-col justify-center sm:w-auto sm:flex-row [&>li]:w-full sm:[&>li]:w-auto [&_a]:w-full"
          />
          <a
            href={hero.secondaryCta.href}
            className="group inline-flex items-center gap-2 rounded-full px-1 py-1 text-[0.95rem] font-semibold text-white/75 transition-colors hover:text-white"
          >
            {hero.secondaryCta.label}
            <ArrowRight className="size-4 rotate-90 transition-transform group-hover:translate-y-0.5" />
          </a>
        </div>
      </div>

      {/* The section edge crops the phones so they rise into view. */}
      <div className="relative mx-auto mt-14 h-[22rem] w-full max-w-[72rem] sm:mt-16 sm:h-[30rem] lg:h-[34rem]">
        {FAN.map((p) => (
          <div
            key={p.screen}
            className={`absolute animate-rise ${p.className} ${p.wideOnly ? "hidden lg:block" : ""}`}
            style={{ animationDelay: `${p.delay}ms` }}
          >
            <div className="animate-float" style={{ animationDelay: p.float }}>
              <Phone
                screen={p.screen}
                decorative
                sizes={p.wideOnly ? "200px" : "(min-width: 768px) 260px, 40vw"}
                className={p.wideOnly ? "brightness-[0.6]" : "brightness-[0.8]"}
              />
            </div>
          </div>
        ))}
        <div className="absolute left-1/2 top-0 z-10 w-[56%] -translate-x-1/2 animate-lift [animation-delay:300ms] sm:w-[44%] md:w-[27%]">
          <div className="animate-float">
            <Phone screen="discover" priority sizes="(min-width: 768px) 310px, 56vw" />
          </div>
        </div>
      </div>
    </section>
  );
}
