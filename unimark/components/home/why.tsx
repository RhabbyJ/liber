import { why } from "@/content/home";
import { Icon } from "../icons";
import { SectionIntro } from "../ui";

export function Why() {
  return (
    <section aria-labelledby="why-title" className="bg-paper py-24 sm:py-32">
      <div className="container-site">
        <SectionIntro id="why-title" eyebrow={why.eyebrow} title={why.title} lead={why.lead} />
        <ul className="mt-14 grid gap-5 md:grid-cols-6 lg:mt-16">
          {why.items.map((item, i) => {
            const featured = i === 0;
            return (
              <li
                key={item.title}
                data-reveal
                style={{ "--reveal-delay": `${(i % 3) * 80}ms` } as React.CSSProperties}
                className={`flex flex-col rounded-[1.5rem] p-7 sm:p-8 ${i < 2 ? "md:col-span-3" : "md:col-span-2"} ${
                  featured ? "bg-ink text-white" : "bg-white ring-1 ring-line"
                }`}
              >
                <span
                  className={`grid size-12 place-items-center rounded-2xl ${featured ? "bg-teal text-ink" : "bg-teal-soft text-teal-ink"}`}
                >
                  <Icon name={item.icon} className="size-6" />
                </span>
                <h3 className={`mt-8 font-bold leading-snug tracking-[-0.02em] ${i < 2 ? "text-[1.5rem]" : "text-[1.25rem]"}`}>
                  {item.title}
                </h3>
                <p className={`mt-3 ${featured ? "text-muted-dark" : "text-muted"}`}>{item.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
