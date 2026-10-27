import glow from "../assets/cta-glow.webp";
import { finalCta } from "../content.ts";
import { EmailCta } from "./EmailCta.tsx";
import { Column } from "./Section.tsx";
import { TwoTone } from "./Type.tsx";

export function FinalCta() {
  return (
    <section
      id={finalCta.id}
      className="border-border relative flex min-h-155 scroll-mt-6 items-center overflow-clip border-t py-24"
    >
      <img
        src={glow.src}
        alt=""
        width={glow.width}
        height={glow.height}
        loading="lazy"
        className="absolute inset-0 size-full object-cover"
      />
      <Column className="relative flex flex-col items-center gap-8 text-center">
        <TwoTone size="display" dim={finalCta.dim} bright={finalCta.bright} />
        <EmailCta id="cta-email" />
      </Column>
    </section>
  );
}
