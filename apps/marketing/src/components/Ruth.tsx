import type { ReactNode } from "react";
import { Kbd } from "@avenire/ui/components/kbd";
import answer from "../assets/ruth-answer.webp";
import chart from "../assets/ruth-chart.webp";
import { ruth } from "../content.ts";
import { Column, Frame, Section, SectionHeader } from "./Section.tsx";

const [cited, python, explainer] = ruth.answers;

function Answer({
  item,
  children,
}: {
  item: (typeof ruth.answers)[number] | undefined;
  children: ReactNode;
}) {
  if (!item) return null;
  return (
    <figure className="flex flex-col gap-4">
      <div className="flex h-7 items-center gap-2.5">
        <Kbd>{ruth.shortcut}</Kbd>
        <span className="text-foreground-soft truncate text-sm">{item.question}</span>
      </div>
      <Frame className="flex h-66 items-center justify-center">{children}</Frame>
      <figcaption className="text-foreground text-label">{item.title}</figcaption>
    </figure>
  );
}

/** `explainer` is the hydrated VideoFrame island for the third answer. */
export function Ruth({ explainer: explainerVideo }: { explainer?: ReactNode }) {
  return (
    <Section id={ruth.id}>
      <Column className="flex flex-col gap-14">
        <SectionHeader {...ruth} />
        <div className="grid gap-10 md:grid-cols-3 md:gap-6">
          <Answer item={cited}>
            <img
              src={answer.src}
              alt={cited?.alt}
              width={answer.width}
              height={answer.height}
              loading="lazy"
            />
          </Answer>
          <Answer item={python}>
            <img
              src={chart.src}
              alt={python?.alt}
              width={chart.width}
              height={chart.height}
              loading="lazy"
              className="h-full w-auto"
            />
          </Answer>
          <Answer item={explainer}>{explainerVideo}</Answer>
        </div>
      </Column>
    </Section>
  );
}
