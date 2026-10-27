import type { ReactNode } from "react";
import { cn } from "@avenire/ui/lib/utils";

/** Mono caps label above a heading: "01 · CAPTURE". */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-foreground-subtle font-mono text-xs tracking-eyebrow uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

type TwoToneProps = {
  /** Lines set in the dim tone, each on its own line. */
  dim: string | readonly string[];
  bright: string;
  size: "display" | "headline" | "subhead";
  as?: "h1" | "h2";
  className?: string;
};

const sizes = { display: "text-display", headline: "text-headline", subhead: "text-subhead" };

/** The page's signature heading: a dim line (or two), then a bright one. */
export function TwoTone({ dim, bright, size, as: Tag = "h2", className }: TwoToneProps) {
  const dimLines = typeof dim === "string" ? [dim] : dim;
  return (
    <Tag className={cn(sizes[size], "text-balance", className)}>
      {dimLines.map((line) => (
        <span key={line} className="text-muted-foreground block">
          {line}
        </span>
      ))}
      <span className="text-foreground block">{bright}</span>
    </Tag>
  );
}
