import type { ReactNode } from "react";
import { finalCta } from "../content.ts";
import { EmailCta } from "./EmailCta.tsx";
import { Column } from "./Section.tsx";
import { TwoTone } from "./Type.tsx";

/** `glow` is the CtaGlow island (the hero's liquid as a horizon), passed in from the Astro page. */
export function FinalCta({ glow }: { glow?: ReactNode }) {
  return (
    <section
      id={finalCta.id}
      className="border-border relative flex min-h-155 scroll-mt-6 items-center overflow-clip border-t py-24"
    >
      {glow}
      <Column className="relative flex flex-col items-center gap-8 text-center">
        <TwoTone size="display" dim={finalCta.dim} bright={finalCta.bright} />
        <div data-reveal="" className="flex w-full justify-center">
          <EmailCta id="cta-email" />
        </div>
      </Column>
    </section>
  );
}
