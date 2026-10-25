"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsSnapshot, UserSettings, UserSettingsPatch } from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { createAvenireAuthClient } from "@avenire/auth/client";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@avenire/ui/components/alert-dialog";
import { Avatar, AvatarFallback } from "@avenire/ui/components/avatar";
import { Button, buttonVariants } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@avenire/ui/components/select";
import { CaptureShortcutKeys } from "~/features/capture/CaptureShortcutKeys";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { Switch } from "@avenire/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@avenire/ui/components/tooltip";
import { cn } from "@avenire/ui/lib/utils";
import { PageColumn, PageHeader } from "~/components/app";
import { errorMessage, useApi } from "~/lib/rpc";
import { useSettings } from "./SettingsProvider";
import { Row, Section, UsageRow } from "./settings-ui";

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "plan", label: "Plan and usage" },
  { id: "overnight", label: "Overnight runs" },
  { id: "capture", label: "Capture" },
  { id: "notifications", label: "Notifications" },
  { id: "folders", label: "Connected folders" },
  { id: "privacy", label: "Privacy" },
] as const;

const READY_TIMES = Array.from({ length: 13 }, (_, index) => {
  const minutes = 5 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 === 0 ? "00" : "30"}`;
});

function clockLabel(value: string): string {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

function formatBytes(bytes: number, unitOf = bytes): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let reference = unitOf;
  while (reference >= 1024 && index < units.length - 1) {
    reference /= 1024;
    index += 1;
  }
  const value = bytes / 1024 ** index;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${units[index]}`;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  credential: "Email and password",
  github: "GitHub",
  apple: "Apple",
};

function merge(settings: UserSettings, patch: UserSettingsPatch): UserSettings {
  return {
    ...settings,
    ...patch,
    notifications: { ...settings.notifications, ...patch.notifications },
  } as UserSettings;
}

export function SettingsPage() {
  const api = useApi();
  const { data, error, loading, refetch, setData } = useSettings();
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  /** Applies a patch immediately; on failure reloads the server's copy and toasts. */
  const save = useCallback(
    async (patch: UserSettingsPatch) => {
      setData((previous) =>
        previous ? { ...previous, settings: merge(previous.settings, patch) } : previous,
      );
      try {
        const settings = await call(api, (client) => client["settings.update"](patch));
        setData((previous) => (previous ? { ...previous, settings } : previous));
      } catch (cause) {
        void refetch();
        toast.error(`Couldn't save: ${errorMessage(cause)}`);
      }
    },
    [api, refetch, setData],
  );

  // Overnight runs follow the browser's time zone; tell the server once if it differs.
  const zoneSynced = useRef(false);
  useEffect(() => {
    if (!data || zoneSynced.current) return;
    zoneSynced.current = true;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && zone !== data.settings.timeZone) void save({ timeZone: zone });
  }, [data, save]);

  // Scroll-spy: highlight the section nearest the top of the viewport.
  useEffect(() => {
    if (!data) return;
    const sections = SECTIONS.map(({ id }) => document.getElementById(id)).filter(
      (node): node is HTMLElement => node !== null,
    );
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = SECTIONS.find(({ id }) => visible.has(id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    sections.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [data]);

  return (
    <div className="min-h-dvh pb-[max(48px,env(safe-area-inset-bottom))]">
      <PageHeader title="Settings" />
      <PageColumn width={880} className="md:pt-6">
        <h1 className="hidden px-0 pb-[18px] text-2xl leading-[30px] font-semibold md:block">
          Settings
        </h1>
        <div className="md:flex md:items-start md:gap-[56px]">
          <nav
            aria-label="Settings sections"
            className="sticky top-6 hidden w-[180px] shrink-0 flex-col gap-0.5 md:flex"
          >
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                aria-current={active === section.id ? "true" : undefined}
                onClick={() => {
                  setActive(section.id);
                  document
                    .getElementById(section.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cn(
                  "h-8 rounded-lg px-2.5 text-left text-[13px] transition-colors",
                  active === section.id
                    ? "bg-surface-3 text-foreground"
                    : "text-foreground-soft hover:text-foreground",
                )}
              >
                {section.label}
              </button>
            ))}
            <Link
              href="/trash"
              className="flex h-8 items-center rounded-lg px-2.5 text-[13px] text-foreground-soft transition-colors hover:text-foreground"
            >
              Trash
            </Link>
          </nav>

          <div className="min-w-0 flex-1 md:-mt-[34px]">
            {data ? (
              <Content
                snapshot={data}
                save={save}
                reload={() => invalidateLibrary(api, ["settings"])}
                setData={setData}
              />
            ) : error && !loading ? (
              <div className="flex flex-col items-center gap-3 py-24 text-center text-[13.5px] text-muted-foreground">
                <p>Couldn't load settings. {errorMessage(error)}</p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : (
              <SettingsSkeleton />
            )}
          </div>
        </div>
      </PageColumn>
    </div>
  );
}

function Content({
  snapshot,
  save,
  reload,
  setData,
}: {
  snapshot: SettingsSnapshot;
  save: (patch: UserSettingsPatch) => Promise<void>;
  reload: () => void;
  setData: (data: SettingsSnapshot) => void;
}) {
  const { settings, account, usage } = snapshot;
  const bridge = typeof window === "undefined" ? undefined : window.avenire;
  const readyTimes = READY_TIMES.includes(settings.resultsReadyBy)
    ? READY_TIMES
    : [...READY_TIMES, settings.resultsReadyBy].sort();
  const resetDay = new Date(usage.resetsAt).toLocaleDateString(undefined, { weekday: "long" });

  return (
    <>
      <Section id="account" title="Account" className="md:pt-[34px]">
        <ProfileRow snapshot={snapshot} setData={setData} reload={reload} />
        <Row
          title="Sign-in"
          description={
            account.providers.map((provider) => PROVIDER_LABELS[provider] ?? provider).join(", ") ||
            undefined
          }
        />
        <DevicesRow account={account} reload={reload} />
        <SignOutRow className="max-md:hidden" />
      </Section>

      <Section
        id="plan"
        title="Plan and usage"
        note={
          <span className="md:hidden">Resets {resetDay}. Chats and capture are unlimited.</span>
        }
      >
        <Row title={usage.plan === "pro" ? "Pro" : "Student · free"} />
        <UsageRow
          label="Overnight runs this week"
          value={`${usage.overnightRunsThisWeek} of ${usage.overnightRunLimit}`}
          percent={
            usage.overnightRunLimit > 0
              ? (usage.overnightRunsThisWeek / usage.overnightRunLimit) * 100
              : 0
          }
          hint={`Resets ${resetDay}. Chats and capture are unlimited.`}
        />
        <UsageRow
          label="Storage"
          value={`${formatBytes(usage.storageBytes, usage.storageLimitBytes)} of ${formatBytes(usage.storageLimitBytes)}`}
          percent={
            usage.storageLimitBytes > 0 ? (usage.storageBytes / usage.storageLimitBytes) * 100 : 0
          }
        />
      </Section>

      <Section id="overnight" title="Overnight runs">
        <Row
          title="Have results ready by"
          description="The morning report appears the first time you open Avenire after this."
        >
          <Choice
            label="Have results ready by"
            value={settings.resultsReadyBy}
            options={readyTimes.map((time) => ({ value: time, label: clockLabel(time) }))}
            onChange={(resultsReadyBy) => void save({ resultsReadyBy })}
          />
        </Row>
        <Row
          title="Ruth can change files"
          description="Default for new tasks. You can change it per task."
        >
          <Choice
            label="Ruth can change files"
            value={settings.fileChanges}
            options={[
              { value: "propose", label: "Propose, I accept" },
              { value: "apply", label: "Apply, I can undo" },
            ]}
            onChange={(fileChanges) => void save({ fileChanges })}
          />
        </Row>
        <Row
          title="Sort Unfiled sources every night"
          description="Ruth proposes notebooks for new captures. Uses no runs."
        >
          <Toggle
            label="Sort Unfiled sources every night"
            checked={settings.sortUnfiledNightly}
            onChange={(sortUnfiledNightly) => void save({ sortUnfiledNightly })}
          />
        </Row>
      </Section>

      <Section id="capture" title="Capture">
        <Row
          title="Capture shortcut"
          description={
            bridge
              ? "Saves everything open in the app you're using."
              : "Change it in the Avenire app on your computer."
          }
        >
          <CaptureShortcutKeys />
        </Row>
        <Row
          title="Capture pages you're logged into"
          description="Off. On for: nothing yet. Uses your own browser session; nothing is shared."
        >
          <Toggle
            label="Capture pages you're logged into"
            checked={settings.captureLoggedInPages}
            onChange={(captureLoggedInPages) => void save({ captureLoggedInPages })}
          />
        </Row>
        <Row title="Paywalled pages" description="What to keep when a page is behind a paywall.">
          <Choice
            label="Paywalled pages"
            value={settings.paywalledPages}
            options={[
              { value: "title-abstract", label: "Title and abstract" },
              { value: "skip", label: "Skip" },
            ]}
            onChange={(paywalledPages) => void save({ paywalledPages })}
          />
        </Row>
      </Section>

      <Section id="notifications" title="Notifications">
        <Row title="Morning report" description="When the overnight run finishes">
          <Toggle
            label="Morning report"
            checked={settings.notifications.morningReport}
            onChange={(morningReport) => void save({ notifications: { morningReport } })}
          />
        </Row>
        <Row title="Ruth needs you" description="When a run is waiting for your answer">
          <Toggle
            label="Ruth needs you"
            checked={settings.notifications.needsYou}
            onChange={(needsYou) => void save({ notifications: { needsYou } })}
          />
        </Row>
        <Row title="Run failed" description="When an overnight run couldn't finish">
          <Toggle
            label="Run failed"
            checked={settings.notifications.runFailed}
            onChange={(runFailed) => void save({ notifications: { runFailed } })}
          />
        </Row>
      </Section>

      <Section id="folders" title="Connected folders">
        <Row
          title={
            <span className="text-muted-foreground">
              Connect folders from the Avenire app on your computer
            </span>
          }
        />
      </Section>

      <Section id="privacy" title="Privacy">
        <Row title="Your files are private to you.">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button variant="secondary" disabled>
                  Export data
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Coming soon</TooltipContent>
          </Tooltip>
        </Row>
      </Section>

      <Section id="trash" title="Trash" className="md:hidden">
        <Link href="/trash" className="block">
          <Row title="Trash">
            <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
          </Row>
        </Link>
      </Section>

      <div className="pt-[22px] md:hidden">
        <div className="rounded-[10px] bg-surface-2">
          <SignOutRow />
        </div>
      </div>
    </>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        className="w-auto max-md:h-11 max-md:border-0 max-md:bg-transparent max-md:px-0 max-md:text-[15px] max-md:text-foreground-soft"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Switch
      aria-label={label}
      checked={checked}
      onCheckedChange={onChange}
      className="max-md:origin-right max-md:scale-[1.35]"
    />
  );
}

function ProfileRow({
  snapshot,
  setData,
  reload,
}: {
  snapshot: SettingsSnapshot;
  setData: (data: SettingsSnapshot) => void;
  reload: () => void;
}) {
  const api = useApi();
  const { account } = snapshot;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const initials =
    account.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || account.email[0]?.toUpperCase();

  async function submit() {
    const next = name.trim();
    setEditing(false);
    if (!next || next === account.name) return;
    setData({ ...snapshot, account: { ...account, name: next } });
    try {
      await call(api, (client) => client["settings.updateProfile"]({ name: next }));
      reload();
    } catch (cause) {
      setData(snapshot);
      toast.error(`Couldn't update your name: ${errorMessage(cause)}`);
    }
  }

  return (
    <div className="flex min-h-[60px] items-center gap-3 px-4 py-2 md:min-h-[64px] md:px-0 md:py-3">
      <Avatar className="size-10 md:size-9">
        <AvatarFallback className="bg-[#242424] text-sm font-semibold md:text-[13px]">
          {initials}
        </AvatarFallback>
      </Avatar>
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            autoFocus
            value={name}
            maxLength={100}
            aria-label="Name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditing(false);
            }}
            className="h-9 max-w-xs rounded-lg bg-surface-3 text-[13.5px]"
          />
          <Button type="submit" size="default">
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-base leading-[21px] md:text-[13.5px] md:leading-5 md:font-semibold">
              {account.name}
            </span>
            <span className="truncate text-[13px] leading-[17px] text-muted-foreground md:text-[12.5px]">
              {account.email}
            </span>
          </div>
          <Button
            variant="ghost"
            className="max-md:h-11"
            onClick={() => {
              setName(account.name);
              setEditing(true);
            }}
          >
            Edit
          </Button>
        </>
      )}
    </div>
  );
}

function DevicesRow({
  account,
  reload,
}: {
  account: SettingsSnapshot["account"];
  reload: () => void;
}) {
  const api = useApi();
  const [confirming, setConfirming] = useState(false);
  const others = account.sessions.filter((session) => !session.current);
  // One label per device kind: "Chrome on Linux (this one) · Safari on iPhone ×2".
  const current = account.sessions.find((session) => session.current)?.device;
  const counts = new Map<string, number>();
  for (const session of account.sessions)
    counts.set(session.device, (counts.get(session.device) ?? 0) + 1);
  const labels = [...counts].map(([device, count]) => {
    if (device !== current) return count > 1 ? `${device} ×${count}` : device;
    return count > 1 ? `${device} (this one) ×${count}` : `${device} (this one)`;
  });

  return (
    <>
      <Row title="Devices" description={labels.join(" · ") || undefined}>
        {others.length > 0 ? (
          <Button variant="ghost" className="max-md:h-11" onClick={() => setConfirming(true)}>
            Sign out everywhere
          </Button>
        ) : null}
      </Row>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out everywhere?</AlertDialogTitle>
            <AlertDialogDescription>
              Every other device will be signed out. You'll stay signed in here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                setConfirming(false);
                call(api, (client) => client["settings.signOutOtherSessions"]())
                  .then(() => {
                    toast("Signed out of your other devices");
                    reload();
                  })
                  .catch((cause: unknown) =>
                    toast.error(`Couldn't sign out: ${errorMessage(cause)}`),
                  );
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SignOutRow({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      const result = await createAvenireAuthClient(window.location.origin).signOut();
      if (result.error) throw new Error(result.error.message ?? "Could not sign out.");
      window.location.assign("/sign-in");
    } catch (cause) {
      setPending(false);
      toast.error(`Couldn't sign out: ${errorMessage(cause)}`);
    }
  }

  return (
    <Row
      title={
        <span className="max-md:flex max-md:h-12 max-md:items-center max-md:px-4 max-md:text-destructive">
          Sign out
        </span>
      }
      className={cn("relative max-md:p-0", className)}
    >
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => void signOut()}
        className="max-md:absolute max-md:inset-0 max-md:size-full max-md:opacity-0"
      >
        Sign out
      </Button>
    </Row>
  );
}

function SettingsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 pt-6">
      {[3, 3, 3, 3].map((rows, group) => (
        <div key={group} className="flex flex-col gap-2 pt-4">
          <Skeleton className="h-4 w-32" />
          <div className="flex flex-col rounded-[10px] bg-surface-2 md:rounded-none md:bg-transparent">
            {Array.from({ length: rows }, (_, row) => (
              <div
                key={row}
                className="flex min-h-[60px] items-center justify-between px-4 md:min-h-[64px] md:px-0"
              >
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-64 max-w-[60vw]" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
