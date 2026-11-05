import { trust } from "../content.ts";
import { Column, Feature, Section } from "./Section.tsx";
import { Eyebrow } from "./Type.tsx";

export function Trust() {
  return (
    <Section className="pt-30">
      <Column className="flex flex-col gap-14">
        <div className="flex flex-col gap-5">
          <Eyebrow>{trust.eyebrow}</Eyebrow>
          <h2 data-reveal="" className="text-foreground text-headline text-balance">
            {trust.heading}
          </h2>
        </div>
        <div className="border-border grid border-t md:grid-cols-3">
          {trust.points.map((point) => (
            <Feature
              key={point.title}
              title={point.title}
              className="border-border pt-6 max-md:border-b max-md:pb-6 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
            >
              <p className="text-foreground-subtle text-body">{point.copy}</p>
            </Feature>
          ))}
        </div>
      </Column>
    </Section>
  );
}
