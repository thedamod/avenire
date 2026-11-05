import type { ReactNode } from "react";
import { broughtToYou } from "../content.ts";
import { Column, Frame, Section, SectionHeader } from "./Section.tsx";

/** `video` is the hydrated VideoFrame island, passed in from the Astro page. */
export function BroughtToYou({ video }: { video?: ReactNode }) {
  return (
    <Section id={broughtToYou.id}>
      <Column className="flex flex-col gap-14">
        <SectionHeader {...broughtToYou} />
        <Frame data-reveal="" className="aspect-report">
          {video}
        </Frame>
      </Column>
    </Section>
  );
}
