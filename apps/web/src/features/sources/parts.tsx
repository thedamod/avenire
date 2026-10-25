import { cn } from "@avenire/ui/lib/utils";

/** "Cited in Ruth's answer": the periwinkle h24 r5 tag (14a–c / M18–M20). */
export function CitedChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-[5px] border border-ruth-line bg-ruth-tint px-2 text-xs whitespace-nowrap text-ruth-text",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Flat left-rule aside: the reading note under an image, a source's abstract. */
export function Aside({
  label,
  children,
  footer,
  tone = "plain",
}: {
  label?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tone?: "plain" | "ruth";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-l-2 py-0.5 pl-3",
        tone === "ruth" ? "border-ruth" : "border-input",
      )}
    >
      {label ? <span className="text-xs leading-4 text-muted-foreground">{label}</span> : null}
      <div className="text-[14px] leading-5 font-medium text-foreground md:text-[13.5px]">
        {children}
      </div>
      {footer ? <span className="text-xs leading-4 text-muted-foreground">{footer}</span> : null}
    </div>
  );
}
