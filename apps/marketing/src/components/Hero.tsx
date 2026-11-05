import type { ReactNode } from "react";
import home from "../assets/shot-home.webp";
import { hero } from "../content.ts";
import { EmailCta } from "./EmailCta.tsx";
import { Nav } from "./Nav.tsx";
import { Column } from "./Section.tsx";
import { TwoTone } from "./Type.tsx";

/** `art` is the HeroArt island (rocket and liquid exhaust), passed in from the Astro page. */
export function Hero({ art }: { art?: ReactNode }) {
  return (
    <div className="relative overflow-clip">
      {art}
      <Nav />
      <Column className="relative flex flex-col items-center gap-7 pt-24 pb-16 text-center lg:pt-37.5 lg:pb-22">
        <TwoTone as="h1" size="display" dim={hero.dim} bright={hero.bright} />
        <p data-reveal="" className="text-foreground-soft text-lead max-w-lead">
          {hero.lead}
        </p>
        <div data-reveal="" className="flex w-full justify-center pt-2">
          <EmailCta id="hero-email" />
        </div>
      </Column>
      <Column className="relative flow-root">
        <div
          data-reveal=""
          className="max-w-window border-input bg-background shadow-window mx-auto -mb-7.5 overflow-clip rounded-sm border"
        >
          <img
            src={home.src}
            alt={hero.screenshotAlt}
            width={home.width}
            height={home.height}
            className="h-auto w-full"
          />
        </div>
      </Column>
    </div>
  );
}
