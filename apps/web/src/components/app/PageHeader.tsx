"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment } from "react";
import type { FolderColor } from "@avenire/contracts";
import { ArrowLeft, ChevronLeft, type LucideIcon } from "lucide-react";
import { cn } from "@avenire/ui/lib/utils";
import { DesktopTitlebar, useTitlebarSlots } from "~/features/desktop/titlebar";
import { HeaderMenu } from "./HeaderMenu";
import { NotebookSwatch } from "./NotebookSwatch";

export interface HeaderCrumb {
  readonly label: string;
  readonly href?: string;
  /** Notebook colour; shows the swatch before the label. */
  readonly color?: FolderColor | null;
}

export interface HeaderAction {
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly onSelect?: () => void;
  readonly href?: string;
  readonly destructive?: boolean;
  /** Phone: show as a round icon button alongside the ⋯ menu (max one). */
  readonly pinned?: boolean;
  readonly disabled?: boolean | undefined;
}

const NO_ACTIONS: readonly HeaderAction[] = [];

/** Round glass button of the phone header (40px, 44px hit area). */
export const glassButton =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-white/[.08] bg-[rgba(30,30,30,0.72)] text-foreground backdrop-blur-[16px] transition-colors active:bg-[rgba(46,46,46,0.8)] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-[17px]";

/**
 * Shared page chrome: desktop breadcrumbs with a context menu on the same row; in the desktop app
 * both move into the window's title bar. Phone: a sticky glass bar with back, title, one pinned
 * action, and the context menu.
 */
export function PageHeader({
  backHref = "/",
  backLabel = "Home",
  crumbs,
  status,
  title,
  subtitle,
  actions = NO_ACTIONS,
  className,
}: {
  backHref?: string;
  backLabel?: string;
  crumbs?: readonly HeaderCrumb[];
  /** Short status after the breadcrumb, e.g. "Didn't finish". */
  status?: React.ReactNode | undefined;
  /** Phone title; defaults to the last crumb. */
  title?: string;
  subtitle?: string | undefined;
  actions?: readonly HeaderAction[];
  className?: string;
}) {
  const router = useRouter();
  const titlebar = useTitlebarSlots();
  const pinned = actions.filter((action) => action.pinned && action.icon).slice(0, 1);
  const overflow = actions.filter((action) => !pinned.includes(action));
  const phoneTitle = title ?? crumbs?.at(-1)?.label;
  const desktopCrumbs: readonly HeaderCrumb[] = crumbs?.length
    ? crumbs
    : title
      ? [{ label: title }]
      : [];

  const breadcrumbs = (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px]">
      <button
        type="button"
        onClick={() => router.push(backHref)}
        className="-ml-1.5 inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-1.5 text-foreground-soft transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {desktopCrumbs.length ? <span className="sr-only">Back</span> : backLabel}
      </button>
      {desktopCrumbs.map((crumb, index) => {
        const last = index === desktopCrumbs.length - 1;
        const content = (
          <>
            {crumb.color !== undefined ? <NotebookSwatch color={crumb.color} /> : null}
            <span className="truncate">{crumb.label}</span>
          </>
        );
        return (
          <Fragment key={`${crumb.label}-${index}`}>
            {index > 0 ? <span className="text-muted-foreground">/</span> : null}
            {crumb.href && !last ? (
              <Link
                href={crumb.href}
                className="flex min-w-0 items-center gap-2 text-foreground-soft transition-colors hover:text-foreground"
              >
                {content}
              </Link>
            ) : (
              <span
                aria-current={last ? "page" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-2",
                  last ? "font-semibold text-foreground" : "text-foreground-soft",
                )}
              >
                {content}
              </span>
            )}
          </Fragment>
        );
      })}
      {status ? <span className="shrink-0 text-[12.5px]">{status}</span> : null}
    </nav>
  );

  return (
    <header className={cn("relative z-30 max-md:sticky max-md:top-0", className)}>
      {/* Desktop */}
      {titlebar ? (
        <DesktopTitlebar
          slots={titlebar}
          start={breadcrumbs}
          end={<HeaderMenu actions={actions} />}
        />
      ) : (
        <div
          data-desktop-header
          className="hidden h-14 items-center justify-between gap-6 px-6 md:flex"
        >
          {breadcrumbs}
          <HeaderMenu actions={actions} />
        </div>
      )}

      {/* Phone */}
      <div className="surface-glass flex h-[calc(52px+env(safe-area-inset-top))] items-center gap-2 px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex w-[88px] shrink-0 items-center">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            aria-label="Back"
            className={glassButton}
          >
            <ChevronLeft />
          </button>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-px text-center">
          {phoneTitle ? (
            <div className="flex max-w-full items-center gap-1.5">
              {crumbs?.at(-1)?.color !== undefined && !title ? (
                <NotebookSwatch color={crumbs?.at(-1)?.color} />
              ) : null}
              <span className="truncate text-[15px] leading-5 font-semibold">{phoneTitle}</span>
            </div>
          ) : null}
          {subtitle || status ? (
            <span className="max-w-full truncate text-xs leading-4 text-muted-foreground">
              {subtitle ?? status}
            </span>
          ) : null}
        </div>
        <div className="flex w-[88px] shrink-0 items-center justify-end gap-2">
          {pinned.map((action) => {
            const Icon = action.icon!;
            return action.href ? (
              <Link
                key={action.label}
                href={action.href}
                aria-label={action.label}
                className={glassButton}
              >
                <Icon />
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                aria-label={action.label}
                disabled={action.disabled}
                onClick={action.onSelect}
                className={glassButton}
              >
                <Icon />
              </button>
            );
          })}
          <HeaderMenu actions={overflow} className={glassButton} />
        </div>
      </div>
    </header>
  );
}
