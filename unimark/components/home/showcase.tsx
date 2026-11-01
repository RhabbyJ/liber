"use client";

import { useEffect, useRef, useState } from "react";
import { showcase } from "@/content/home";
import { Phone, PhoneFrame, ScreenImage } from "../phone";
import { SectionIntro } from "../ui";

function ItemText({ index, compact = false }: { index: number; compact?: boolean }) {
  const item = showcase.items[index]!;
  return (
    <>
      <p className="text-[0.8rem] font-bold uppercase tracking-[0.14em] text-teal">
        <span aria-hidden="true">{String(index + 1).padStart(2, "0")} · </span>
        {item.kicker}
      </p>
      <h3
        className={`mt-3 font-extrabold leading-[1.05] tracking-[-0.035em] ${
          compact ? "text-[1.6rem]" : "mt-4 text-[clamp(1.9rem,1.4rem+2vw,3rem)]"
        }`}
      >
        {item.title}
      </h3>
      <p className={compact ? "mt-3 text-[0.98rem] text-muted-dark" : "text-lead mt-5 text-muted-dark"}>{item.body}</p>
    </>
  );
}

/** Large screens: the phone stays pinned while the copy scrolls; the screen follows the item in view. */
function ScrollStory() {
  const [active, setActive] = useState(0);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      // A thin band across the middle of the viewport decides the active item.
      { rootMargin: "-48% 0px -48% 0px" },
    );
    itemRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const goTo = (i: number) => itemRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="mt-6 hidden grid-cols-[1fr_minmax(0,26rem)] gap-20 lg:grid">
      <ol>
        {showcase.items.map((item, i) => (
          <li
            key={item.screen}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            data-index={i}
            className={`flex min-h-[66vh] max-w-lg flex-col justify-center transition-opacity duration-500 ${
              active === i ? "opacity-100" : "opacity-30"
            }`}
          >
            <ItemText index={i} />
          </li>
        ))}
      </ol>

      <div>
        <div className="sticky top-[max(6rem,calc(50vh-21rem))] flex flex-col items-center">
          {/* Visual companion to the text on the left, which already describes each screen. */}
          <div className="relative w-[min(19.5rem,calc((100vh-12rem)*0.478))]" aria-hidden="true">
            <div className="absolute inset-x-[10%] top-[20%] -z-10 h-[60%] rounded-full bg-teal/25 blur-[90px]" />
            <PhoneFrame>
              <div className="relative">
                {showcase.items.map((item, i) => (
                  <ScreenImage
                    key={item.screen}
                    screen={item.screen}
                    decorative
                    sizes="312px"
                    className={`transition-opacity duration-500 ${i === 0 ? "relative" : "absolute inset-0"} ${
                      active === i ? "opacity-100" : "opacity-0"
                    }`}
                  />
                ))}
              </div>
            </PhoneFrame>
          </div>
          <div className="mt-8 flex gap-2">
            {showcase.items.map((item, i) => (
              <button
                key={item.screen}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show ${item.kicker}`}
                aria-current={active === i ? "step" : undefined}
                className="group grid h-6 place-items-center px-0.5"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ${
                    active === i ? "w-8 bg-teal" : "w-3 bg-white/25 group-hover:bg-white/50"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small screens: a swipeable row of phones with a position indicator. */
function Carousel() {
  const trackRef = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const track = trackRef.current;
    const first = track?.firstElementChild as HTMLElement | null;
    if (!track || !first) return;
    const step = first.offsetWidth + parseFloat(getComputedStyle(track).columnGap || "0");
    setActive(Math.min(showcase.items.length - 1, Math.max(0, Math.round(track.scrollLeft / step))));
  };

  const goTo = (i: number) => {
    const el = trackRef.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  return (
    <div className="mt-12 lg:hidden">
      <ol
        ref={trackRef}
        onScroll={onScroll}
        tabIndex={0}
        aria-label="App screens"
        className="-mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-[11vw] pb-2 [scrollbar-width:none] sm:-mx-8 [&::-webkit-scrollbar]:hidden"
      >
        {showcase.items.map((item, i) => (
          <li key={item.screen} className="w-[78vw] max-w-[22rem] shrink-0 snap-center">
            <div className="mx-auto w-[min(58vw,15rem)]">
              <Phone screen={item.screen} sizes="58vw" />
            </div>
            <div className="mt-8 text-center">
              <ItemText index={i} compact />
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex items-center justify-center gap-2">
        {showcase.items.map((item, i) => (
          <button
            key={item.screen}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show ${item.kicker}`}
            aria-current={active === i ? "step" : undefined}
            className="grid h-8 place-items-center px-1"
          >
            <span className={`block h-1.5 rounded-full transition-all duration-300 ${active === i ? "w-8 bg-teal" : "w-3 bg-white/25"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function Showcase() {
  return (
    <section id="app" aria-labelledby="showcase-title" className="relative isolate overflow-clip bg-ink py-24 text-white sm:py-32">
      <div className="bg-dots absolute inset-0 -z-10 opacity-70" aria-hidden="true" />
      <div className="container-site">
        <SectionIntro id="showcase-title" tone="dark" eyebrow={showcase.eyebrow} title={showcase.title} lead={showcase.lead} />
        <ScrollStory />
        <Carousel />
      </div>
    </section>
  );
}
