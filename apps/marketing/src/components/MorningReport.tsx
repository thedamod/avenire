import type { ReactNode } from "react";
import { morningReport } from "../content.ts";
import { Column, Frame, Section, SectionHeader } from "./Section.tsx";

/** `video` is the hydrated VideoFrame island, passed in from the Astro page. */
export function MorningReport({ video }: { video?: ReactNode }) {
  return (
    <Section id={morningReport.id}>
      <Column className="flex flex-col gap-14">
        <SectionHeader {...morningReport} />
        <Frame data-reveal="" className="aspect-report">
          {video}
        </Frame>
      </Column>
    </Section>
  );
}
