"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { howItWorks } from "@/content/home";
import { WheelDots } from "../brand/logo";
import { SectionIntro } from "../ui";

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabs = howItWorks.tabs;
  const current = tabs[active] ?? tabs[0]!;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight" ? (active === last ? 0 : active + 1)
      : e.key === "ArrowLeft" ? (active === 0 ? last : active - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="how-it-works" aria-labelledby="how-title" className="bg-white py-24 sm:py-32">
      <div className="container-site">
        <SectionIntro id="how-title" eyebrow={howItWorks.eyebrow} title={howItWorks.title} />

        <div className="mt-10 flex justify-center" data-reveal style={{ "--reveal-delay": "120ms" } as React.CSSProperties}>
          <div role="tablist" aria-label="Choose a path" className="relative grid grid-cols-2 rounded-full bg-paper p-1.5 ring-1 ring-line">
            <span
              aria-hidden="true"
              className="absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-full bg-ink shadow-lift transition-transform duration-300 ease-[var(--ease-out-soft)]"
              style={{ transform: `translateX(${active * 100}%)` }}
            />
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={active === i}
                aria-controls={`panel-${tab.id}`}
                tabIndex={active === i ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={onKeyDown}
                className={`relative z-10 whitespace-nowrap rounded-full px-4 py-2.5 text-[0.9rem] font-bold transition-colors duration-300 sm:px-7 sm:text-[0.95rem] ${
                  active === i ? "text-white" : "text-ink/65 hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div
          key={current.id}
          id={`panel-${current.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${current.id}`}
          tabIndex={0}
          className="mt-12 rounded-card outline-offset-8"
        >
          <ol className="grid gap-5 md:grid-cols-3">
            {current.steps.map((step, i) => (
              <li
                key={step.title}
                className="relative flex flex-col rounded-[1.5rem] bg-paper p-7 ring-1 ring-line animate-rise sm:p-8"
                style={{ animationDelay: `${i * 90}ms`, animationDuration: "0.6s" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[2.75rem] font-extrabold leading-none tracking-[-0.05em] text-teal-ink sm:text-[3.25rem]" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <WheelDots className="h-3 w-auto text-teal" />
                </div>
                <h3 className="mt-5 text-[1.3rem] font-bold leading-snug tracking-[-0.02em] sm:mt-8">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-3 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
