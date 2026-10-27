import flow from "../assets/hero-flow.webp";
import rocket from "../assets/hero-rocket.webp";
import home from "../assets/shot-home.webp";
import { hero } from "../content.ts";
import { EmailCta } from "./EmailCta.tsx";
import { Nav } from "./Nav.tsx";
import { Column } from "./Section.tsx";
import { TwoTone } from "./Type.tsx";

export function Hero() {
  return (
    <div className="relative overflow-clip">
      <img
        src={flow.src}
        alt=""
        width={flow.width}
        height={flow.height}
        fetchPriority="high"
        className="absolute inset-0 hidden size-full object-cover object-top lg:block"
      />
      <img
        src={rocket.src}
        alt={hero.rocketAlt}
        width={rocket.width}
        height={rocket.height}
        className="absolute top-15 right-3.5 hidden w-150 lg:block"
      />
      <Nav />
      <Column className="relative flex flex-col items-center gap-7 pt-24 pb-16 text-center lg:pt-37.5 lg:pb-22">
        <TwoTone as="h1" size="display" dim={hero.dim} bright={hero.bright} />
        <p className="text-foreground-soft text-lead max-w-lead">{hero.lead}</p>
        <div className="flex w-full justify-center pt-2">
          <EmailCta id="hero-email" />
        </div>
      </Column>
      <Column className="relative flow-root">
        <div className="max-w-window border-input bg-background shadow-window mx-auto -mb-7.5 overflow-clip rounded-sm border">
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
