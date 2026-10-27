import type { ReactNode } from "react";
import { cn } from "@avenire/ui/lib/utils";
import { Eyebrow, TwoTone } from "./Type.tsx";

/** The page column (`max-w-page`) with its responsive gutter. */
export function Column({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("max-w-page mx-auto w-full px-6 md:px-10", className)}>{children}</div>;
}

/** A full-width band separated from the one above by a hairline. */
export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("border-border scroll-mt-6 border-t pt-24 pb-30", className)}>
      {children}
    </section>
  );
}

/** Eyebrow and two-tone headline on the left, a short intro bottom-aligned on the right. */
export function SectionHeader({
  eyebrow,
  dim,
  bright,
  aside,
}: {
  eyebrow: string;
  dim: string;
  bright: string;
  aside: string;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-heading flex flex-col gap-5">
        <Eyebrow>{eyebrow}</Eyebrow>
        <TwoTone dim={dim} bright={bright} size="headline" />
      </div>
      <p className="text-foreground-soft max-w-aside text-body-lg shrink-0">{aside}</p>
    </div>
  );
}

/** Bordered container for screenshots and video. */
export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "border-input bg-surface-2 relative overflow-clip rounded-sm border",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Title and copy row in a divided feature list. */
export function Feature({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <h3 className="text-foreground text-label">{title}</h3>
      {children}
    </div>
  );
}
