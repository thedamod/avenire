import { LogoMark } from "./Icons.tsx";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <a
      href={href}
      className="text-foreground inline-flex items-center gap-2.5"
      aria-label="Avenire home"
    >
      <LogoMark className="h-4.5 w-5.5" />
      <span className="text-logo">Avenire</span>
    </a>
  );
}
