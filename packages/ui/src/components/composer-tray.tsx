import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils.ts";
import { focusRing } from "./shared.ts";

/**
 * The single drop-up attached above the chat composer: file changes, approvals, questions, errors.
 * Tone colours the header icon only; there are no tinted backgrounds. The composer sits in front
 * of the tray's bottom 16px, so give the composer `relative z-10`.
 *
 * ```tsx
 * <ComposerTray tone="ruth" collapsed={collapsed}>
 *   <ComposerTrayHeader
 *     icon={<Sparkles />}
 *     title="Ruth wants to move 3 files"
 *     meta="Biology / Cell division"
 *     step="1/2"
 *     onToggleCollapsed={() => setCollapsed((c) => !c)}
 *     action={<Button size="sm">Review</Button>}
 *   />
 *   <ComposerTrayBody>
 *     <ComposerTrayRow icon={<FileText />} label="mitosis.pdf" detail="Move to Cell division" />
 *     <ComposerTrayActions start={<Button variant="ghost" size="sm">Skip</Button>}>
 *       <Button variant="secondary">Deny</Button>
 *       <Button>Approve</Button>
 *     </ComposerTrayActions>
 *   </ComposerTrayBody>
 * </ComposerTray>
 * <Composer className="relative z-10" />
 * ```
 */
type TrayTone = "ruth" | "danger";

const TrayContext = React.createContext<{ tone: TrayTone; collapsed: boolean }>({
  tone: "ruth",
  collapsed: false,
});

function ComposerTray({
  className,
  tone = "ruth",
  collapsed = false,
  ...props
}: React.ComponentProps<"div"> & { tone?: TrayTone; collapsed?: boolean }) {
  return (
    <TrayContext.Provider value={{ tone, collapsed }}>
      <div
        data-slot="composer-tray"
        data-tone={tone}
        data-collapsed={collapsed ? "" : undefined}
        className={cn(
          "bg-tray border-sheet-border relative mx-4 -mb-4 flex flex-col gap-2.5 rounded-t-[16px] border border-b-0 px-3.5 pt-3 pb-7",
          className,
        )}
        {...props}
      />
    </TrayContext.Provider>
  );
}

type ComposerTrayHeaderProps = Omit<React.ComponentProps<"div">, "title"> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Progress through a multi-step flow, e.g. "1/2". */
  step?: string;
  /** Renders the collapse chevron when provided. */
  onToggleCollapsed?: () => void;
  /** Inline action, shown only while the tray is collapsed. */
  action?: React.ReactNode;
};

function ComposerTrayHeader({
  className,
  icon,
  title,
  meta,
  step,
  onToggleCollapsed,
  action,
  ...props
}: ComposerTrayHeaderProps) {
  const { tone, collapsed } = React.useContext(TrayContext);
  return (
    <div
      data-slot="composer-tray-header"
      className={cn("flex items-start gap-2.5", className)}
      {...props}
    >
      {icon ? (
        <span
          data-slot="composer-tray-icon"
          className={cn(
            "mt-0.5 flex size-[15px] shrink-0 items-center justify-center [&>svg]:size-[15px]",
            tone === "ruth" ? "text-ruth" : "text-destructive",
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div
          data-slot="composer-tray-title"
          className="text-foreground line-clamp-2 text-sm leading-5 font-semibold"
        >
          {title}
        </div>
        {meta ? (
          <div data-slot="composer-tray-meta" className="text-muted-foreground truncate text-xs">
            {meta}
          </div>
        ) : null}
      </div>
      {step ? (
        <span
          data-slot="composer-tray-step"
          className="text-muted-foreground mt-0.5 shrink-0 font-mono text-[11px]"
        >
          {step}
        </span>
      ) : null}
      {collapsed ? action : null}
      {onToggleCollapsed ? (
        <button
          type="button"
          data-slot="composer-tray-toggle"
          aria-label={collapsed ? "Expand" : "Collapse"}
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
          className={cn(
            "text-foreground-soft hover:text-foreground -my-0.5 flex size-6 shrink-0 items-center justify-center rounded-md motion-press",
            focusRing,
          )}
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-[rotate] duration-moderate ease-out",
              collapsed && "rotate-180",
            )}
          />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Collapses by animating grid rows 1fr ↔ 0fr with a fade (200ms ease-out), so the tray's top
 * edge glides instead of jumping. Stays mounted but inert and hidden while collapsed.
 */
function ComposerTrayBody({ className, ...props }: React.ComponentProps<"div">) {
  const { collapsed } = React.useContext(TrayContext);
  return (
    <div
      data-slot="composer-tray-body-frame"
      data-collapsed={collapsed ? "" : undefined}
      aria-hidden={collapsed || undefined}
      inert={collapsed}
      className="grid grid-rows-[1fr] transition-[grid-template-rows,opacity,margin-top] duration-moderate ease-out data-[collapsed]:-mt-2.5 data-[collapsed]:grid-rows-[0fr] data-[collapsed]:opacity-0 motion-reduce:transition-opacity"
    >
      <div className="min-h-0 overflow-hidden">
        <div data-slot="composer-tray-body" className={cn("flex flex-col", className)} {...props} />
      </div>
    </div>
  );
}

type ComposerTrayRowProps = Omit<React.ComponentProps<"div">, "onSelect"> & {
  icon?: React.ReactNode;
  label: React.ReactNode;
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Makes the row an option button; the check shows while `selected`. */
  onSelect?: () => void;
  selected?: boolean;
};

function ComposerTrayRow({
  className,
  icon,
  label,
  detail,
  trailing,
  onSelect,
  selected,
  ...props
}: ComposerTrayRowProps) {
  const selectable = onSelect !== undefined;
  const content = (
    <>
      {icon ? (
        <span className="text-foreground-soft flex size-4 shrink-0 items-center justify-center [&>svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-foreground truncate text-[13.5px] leading-5 font-medium">
          {label}
        </span>
        {detail ? (
          <span className="text-muted-foreground truncate text-xs leading-4">{detail}</span>
        ) : null}
      </span>
      {trailing}
      {selectable ? (
        <span className="flex size-4 shrink-0 items-center justify-center">
          {selected ? <Check data-slot="composer-tray-check" className="text-ruth size-4" /> : null}
        </span>
      ) : null}
    </>
  );
  const rowClass = cn(
    "border-border flex w-full items-center gap-2.5 border-t py-2 text-left",
    className,
  );
  if (selectable) {
    return (
      <button
        type="button"
        data-slot="composer-tray-row"
        aria-pressed={selected ?? false}
        onClick={onSelect}
        className={cn(rowClass, "rounded-none", focusRing)}
        {...(props as React.ComponentProps<"button">)}
      >
        {content}
      </button>
    );
  }
  return (
    <div data-slot="composer-tray-row" className={rowClass} {...props}>
      {content}
    </div>
  );
}

/** Buttons are 32px: exactly one `default` (white) primary, secondary/ghost for the rest. */
function ComposerTrayActions({
  className,
  start,
  children,
  ...props
}: React.ComponentProps<"div"> & { start?: React.ReactNode }) {
  return (
    <div
      data-slot="composer-tray-actions"
      className={cn("flex items-center gap-1.5 pt-2.5", className)}
      {...props}
    >
      {start ? <div className="mr-auto flex items-center">{start}</div> : null}
      <div className="ml-auto flex items-center gap-1.5">{children}</div>
    </div>
  );
}

export { ComposerTray, ComposerTrayActions, ComposerTrayBody, ComposerTrayHeader, ComposerTrayRow };
