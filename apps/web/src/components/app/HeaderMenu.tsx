"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@avenire/ui/components/avatar";
import { useSettings } from "~/features/settings/SettingsProvider";
import { Ellipsis, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import type { HeaderAction } from "./PageHeader";

export const headerMenuButton =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-hover [&_svg]:size-4";

const NO_ACTIONS: readonly HeaderAction[] = [];

const destinations = [
  { label: "Home", href: "/" },
  { label: "Chats and Tasks", href: "/tasks" },
  { label: "Trash", href: "/trash" },
  { label: "Settings", href: "/settings" },
];

export function HeaderNavigationItems() {
  const pathname = usePathname();
  return (
    <>
      {destinations
        .filter((item) => item.href !== pathname)
        .map((item) => (
          <DropdownMenuItem
            key={item.href}
            asChild
            className="h-11 text-[15px] md:h-[30px] md:text-[13px]"
          >
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
      <DropdownMenuSeparator />
      <HeaderProfileItem />
    </>
  );
}

/** Reads preloaded account data without fetching when the menu opens. */
function HeaderProfileItem() {
  const { data, loading } = useSettings();
  const account = data?.account;
  const name = account?.name.trim() || "Your profile";
  const initials = account?.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <DropdownMenuItem asChild className="h-auto min-h-16 py-2.5 md:min-h-14">
      <Link
        href="/settings#account"
        aria-label={`Account settings for ${name}`}
        className="flex min-w-0 gap-2.5"
      >
        <Avatar className="size-8">
          {account?.image ? (
            <AvatarImage src={account.image} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-surface-3 text-xs text-foreground-soft">
            {initials || <UserRound className="size-4" aria-hidden="true" />}
          </AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {loading && !account ? (
            <span
              aria-label="Loading profile"
              className="flex h-[38px] flex-col justify-center gap-1.5"
            >
              <span className="h-3.5 w-24 rounded bg-surface-3" />
              <span className="h-3 w-36 max-w-full rounded bg-surface-3" />
            </span>
          ) : (
            <>
              <span className="truncate text-[13px] font-medium leading-5">{name}</span>
              {account?.email ? (
                <span className="block w-fit max-w-full truncate text-xs leading-4 text-muted-foreground blur-[4px] transition-[filter] hover:blur-none">
                  {account.email}
                </span>
              ) : (
                <span className="truncate text-xs leading-4 text-muted-foreground">
                  Manage your account
                </span>
              )}
            </>
          )}
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

/** Context actions first, followed by the same navigation available from Home. */
export function HeaderMenu({
  actions = NO_ACTIONS,
  className = headerMenuButton,
  label = "More",
}: {
  actions?: readonly HeaderAction[];
  className?: string;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger type="button" aria-label={label} className={className}>
        <Ellipsis aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        data-mobile-sheet="true"
        className="w-64 max-w-[calc(100vw-2rem)]"
      >
        {actions.map((action, index) => (
          <Fragment key={action.label}>
            {action.destructive && index > 0 && !actions[index - 1]?.destructive ? (
              <DropdownMenuSeparator />
            ) : null}
            <DropdownMenuItem
              disabled={action.disabled ?? false}
              variant={action.destructive ? "destructive" : "default"}
              className="h-11 text-[15px] md:h-[30px] md:text-[13px]"
              asChild={Boolean(action.href) && !action.disabled}
              onSelect={() => {
                if (!action.href) action.onSelect?.();
              }}
            >
              {action.href && !action.disabled ? (
                <Link href={action.href}>
                  {action.icon ? <action.icon /> : null}
                  {action.label}
                </Link>
              ) : (
                <>
                  {action.icon ? <action.icon /> : null}
                  {action.label}
                </>
              )}
            </DropdownMenuItem>
          </Fragment>
        ))}
        {actions.length ? <DropdownMenuSeparator /> : null}
        <HeaderNavigationItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
