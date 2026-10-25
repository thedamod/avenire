"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CloudRun } from "@avenire/contracts";
import { ArrowRight, ChevronRight, Moon } from "lucide-react";
import { useQuery } from "~/lib/rpc";
import { NightSky } from "~/components/app/NightSky";
import { runTime } from "~/features/tasks/activity";

const DAY = 24 * 60 * 60 * 1000;

/** The run the toast talks about: the latest one that finished in the last 24 hours. */
export function pickToastRun(runs: readonly CloudRun[] | undefined, now = Date.now()) {
  const recent = (runs ?? [])
    .filter((run) => run.finishedAt && now - Date.parse(run.finishedAt) < DAY)
    .filter(
      (run) => (run.status === "succeeded" && run.assets.length > 0) || run.status === "failed",
    )
    .sort((a, b) => runTime(b).localeCompare(runTime(a)));
  return recent[0];
}

/**
 * Persistent banner on home: what Ruth made overnight (01 / M01), or a calm grey note when
 * the run didn't finish (03 / M02). Quiet days show nothing.
 */
export function MorningToast({ runs }: { runs: readonly CloudRun[] | undefined }) {
  const run = useMemo(() => pickToastRun(runs), [runs]);
  // Animate only when the runs land after home painted; a cached visit shows it in place.
  const [late] = useState(() => runs === undefined);
  if (!run) return null;
  const toast = run.status === "failed" ? <FailedToast run={run} /> : <ReportToast run={run} />;
  return late ? <ToastEnter>{toast}</ToastEnter> : toast;
}

/**
 * Seen about once a day, so it gets a little more time: the space opens (grid rows, 300ms) while
 * the banner fades down into it (260ms). Enter only; it is persistent, so there is no exit.
 * Clipping is dropped once settled so the banner's glow isn't cut off.
 */
function ToastEnter({ children }: { children: React.ReactNode }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    // Reduced motion (no transition) and interrupted transitions settle too.
    const timer = setTimeout(() => setSettled(true), 400);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget) setSettled(true);
      }}
      className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-slow ease-out starting:grid-rows-[0fr] motion-reduce:transition-none"
    >
      <div
        className={
          settled
            ? "min-h-0"
            : "min-h-0 overflow-hidden transition-[opacity,translate] duration-[260ms] ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0"
        }
      >
        {children}
      </div>
    </div>
  );
}

function sentence(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function ReportToast({ run }: { run: CloudRun }) {
  const approvals = useQuery(
    (client) => client["cloud.listPendingApprovals"]({ runId: run.id }),
    `toast-approvals-${run.id}`,
  );
  const changes = (approvals.data ?? []).filter(
    (approval) => approval.status === "pending" || approval.status === "accepted",
  );
  const pending = changes.filter((approval) => approval.status === "pending").length;
  const count = run.assets.length + changes.length;
  const titles = run.assets.map((asset) => asset.title.trim()).filter(Boolean);
  const made = titles.length > 3 ? [...titles.slice(0, 3), `${titles.length - 3} more`] : titles;
  const summary = [
    made.length
      ? capitalize(sentence(made.map((title, index) => (index ? lower(title) : title))))
      : null,
    pending ? `${pending} change${pending === 1 ? "" : "s"} to review` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/report/${run.id}`}
      className="relative flex h-16 items-center gap-3 overflow-hidden rounded-[10px] border border-[#C8D7FF29] bg-[#151443] px-3.5 shadow-[0_0_28px_#5165D833] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:h-[72px] md:px-4"
    >
      <NightSky />
      <span className="relative flex size-[30px] shrink-0 items-center justify-center rounded-lg border border-[#E4EAFF24] bg-[#E4EAFF1A]">
        <Moon className="size-4 text-[#E4EAFF]" strokeWidth={1.4} aria-hidden="true" />
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm leading-[18px] font-semibold text-[#F4F6FF]">
          Ruth finished {count} thing{count === 1 ? "" : "s"} overnight.
        </span>
        <span className="truncate text-xs leading-4 text-[#C8D0F0]">
          {summary}
          <span className="max-md:hidden">{summary ? " · " : ""}Open morning report</span>
        </span>
      </span>
      <ArrowRight
        className="relative size-4 shrink-0 text-[#F4F6FF] max-md:hidden"
        aria-hidden="true"
      />
      <ChevronRight
        className="relative size-4 shrink-0 text-[#F4F6FF] md:hidden"
        aria-hidden="true"
      />
    </Link>
  );
}

function FailedToast({ run }: { run: CloudRun }) {
  const reason = run.error?.split(/(?<=\.)\s/)[0]?.trim();
  return (
    <Link
      href={`/tasks/${run.taskId}`}
      className="relative flex h-16 items-center gap-3 overflow-hidden rounded-[10px] border border-[#2A2A2A] bg-gradient-to-r from-[#161618] to-[#1A1A20] px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:h-[72px] md:px-4"
    >
      <span className="relative flex size-[30px] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
        <Moon className="size-4 text-foreground-soft" strokeWidth={1.4} aria-hidden="true" />
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm leading-[18px] font-semibold">
          Last night's run didn't finish.
        </span>
        <span className="truncate text-xs leading-4 text-foreground-soft">
          {reason ? `${reason} ` : ""}Nothing was changed.
        </span>
      </span>
      <span className="relative shrink-0 text-[13px] font-medium max-md:hidden">Details</span>
      <ChevronRight
        className="relative size-4 shrink-0 text-foreground-soft md:hidden"
        aria-hidden="true"
      />
    </Link>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lower(text: string) {
  // Keep acronyms and proper names ("MIT 5.60") as they are.
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}
