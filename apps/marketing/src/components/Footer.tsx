import { footer } from "../content.ts";
import { MailIcon } from "./Icons.tsx";
import { Logo } from "./Logo.tsx";
import { Column } from "./Section.tsx";
import { Eyebrow } from "./Type.tsx";

export function Footer() {
  return (
    <footer className="border-border relative min-h-130 overflow-clip border-t pt-18 pb-48">
      <p
        aria-hidden="true"
        className="text-ghost text-wordmark pointer-events-none absolute inset-x-0 bottom-0 translate-y-1/3 text-center select-none"
      >
        Avenire
      </p>
      <Column className="relative grid gap-12 md:grid-cols-4">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="text-foreground-subtle max-w-68 text-sm">{footer.tagline}</p>
        </div>
        {footer.columns.map((column) => (
          <nav key={column.heading} aria-label={column.heading} className="flex flex-col gap-3">
            <Eyebrow>{column.heading}</Eyebrow>
            {column.links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-foreground-soft hover:text-foreground w-fit text-sm transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
        ))}
        <div className="flex flex-col gap-4 md:items-end">
          <a
            href={footer.contact.href}
            aria-label={footer.contact.label}
            className="border-input text-foreground-soft hover:text-foreground flex size-8 items-center justify-center rounded-full border transition-colors"
          >
            <MailIcon className="size-4" />
          </a>
          <p className="text-muted-foreground text-sm">{footer.copyright}</p>
        </div>
      </Column>
    </footer>
  );
}
