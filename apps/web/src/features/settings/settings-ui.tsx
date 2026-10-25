"use client";

import { cn } from "@avenire/ui/lib/utils";

/**
 * One settings section, separated from adjacent sections by a single hairline.
 * Phone: small-caps header over a grouped #141414 list (M30).
 */
export function Section({
  id,
  title,
  note,
  className,
  children,
}: {
  id: string;
  title: string;
  /** Muted footnote under the group. */
  note?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-section={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "flex scroll-mt-6 flex-col gap-[7px] pt-[22px] [&+section]:mt-[22px] [&+section]:border-t [&+section]:border-border md:gap-3 md:pt-[34px] md:[&+section]:mt-[34px]",
        className,
      )}
    >
      <h2
        id={`${id}-title`}
        className="px-1 text-xs leading-4 font-medium tracking-[0.04em] text-muted-foreground uppercase md:px-0 md:text-[15px] md:leading-5 md:font-semibold md:tracking-normal md:text-foreground md:normal-case"
      >
        {title}
      </h2>
      <div className="flex flex-col rounded-[10px] bg-surface-2 md:rounded-none md:bg-transparent">
        {children}
      </div>
      {note ? (
        <p className="px-1 text-xs leading-4 text-muted-foreground md:px-0 md:text-[12.5px]">
          {note}
        </p>
      ) : null}
    </section>
  );
}

/** Title + description on the left, a control on the right. 44px+ targets on phone. */
export function Row({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-3 px-4 py-2 md:min-h-[64px] md:px-0 md:py-3",
        description && "max-md:min-h-[60px]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-base leading-[21px] md:text-[13.5px] md:leading-5 md:font-medium">
          {title}
        </div>
        {description ? (
          <div className="text-[13px] leading-[17px] text-muted-foreground md:text-[12.5px] md:leading-4">
            {description}
          </div>
        ) : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** Thin 3px usage bar row: label, mono value, bar. */
export function UsageRow({
  label,
  value,
  percent,
  hint,
}: {
  label: string;
  value: string;
  percent: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 md:gap-2.5 md:px-0 md:py-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-base leading-[21px] md:text-[13.5px] md:leading-5 md:font-medium">
          {label}
        </span>
        <span className="font-mono text-xs tabular-nums">{value}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="h-[3px] w-full overflow-hidden rounded-full bg-[#2A2A2A]"
      >
        <div
          className="h-full origin-left rounded-full bg-foreground transition-[scale] duration-slow ease-out"
          style={{ scale: `${Math.min(100, Math.max(0, percent)) / 100} 1` }}
        />
      </div>
      {hint ? (
        <span className="text-[12.5px] text-muted-foreground max-md:hidden">{hint}</span>
      ) : null}
    </div>
  );
}
