import { buttonVariants } from "@avenire/ui/components/button";
import { nav } from "../content.ts";
import { Logo } from "./Logo.tsx";
import { Column } from "./Section.tsx";

export function Nav() {
  return (
    <header className="border-border relative border-b">
      <Column className="flex h-17 items-center justify-between">
        <div className="flex items-center gap-12">
          <Logo />
          <nav aria-label="Sections" className="hidden items-center gap-7 md:flex">
            {nav.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-foreground-soft hover:text-foreground text-sm transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <a href={nav.signIn.href} className={buttonVariants({ variant: "ghost", shape: "pill" })}>
            {nav.signIn.label}
          </a>
          <a href={nav.cta.href} className={buttonVariants({ shape: "pill" })}>
            {nav.cta.label}
          </a>
        </div>
      </Column>
    </header>
  );
}
