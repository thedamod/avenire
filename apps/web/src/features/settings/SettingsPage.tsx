"use client";

import { useState } from "react";
import type { CloudTask } from "@avenire/contracts";
import { call } from "@avenire/client-runtime/rpc";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { useApi, useQuery, errorMessage } from "~/lib/rpc";

const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeZones = [...new Set([localTimeZone, "UTC", ...Intl.supportedValuesOf("timeZone")])];

export function SettingsPage() {
  const api = useApi();
  const { data, loading, error, refetch } = useQuery(
    (client) => client["cloud.listTasks"](),
    "cloud-tasks",
  );
  const [schedule, setSchedule] = useState<CloudTask>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [shortcut, setShortcut] = useState("CommandOrControl+Shift+Space");
  const [shortcutMessage, setShortcutMessage] = useState<string>();
  const defaultTask = data?.find((task) => task.builtin === "nightly-digest");
  const effective = schedule ?? defaultTask;

  async function saveSchedule() {
    if (!effective) return;
    setSaving(true);
    setMessage(undefined);
    try {
      const saved = await call(api, (client) =>
        client["cloud.updateTask"]({
          taskId: effective.id,
          patch: {
            schedule: effective.schedule,
            enabled: effective.enabled,
            timeZone: effective.timeZone || localTimeZone,
          },
        }),
      );
      setSchedule(saved);
      setMessage("Schedule saved.");
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function saveShortcut() {
    const bridge = window.avenire;
    if (!bridge) return;
    setShortcutMessage(undefined);
    try {
      const accepted = await bridge.setCaptureShortcut(shortcut.trim());
      setShortcutMessage(accepted ? "Shortcut saved." : "That shortcut could not be set.");
    } catch (cause) {
      setShortcutMessage(errorMessage(cause));
    }
  }

  return (
    <section className="mx-auto max-w-3xl p-6">
      <header className="border-b border-border pb-4">
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>
      <section className="grid gap-4 border-b border-border py-6">
        <div>
          <h2 className="font-medium">Ruth Cloud schedule</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose when Ruth prepares your next study brief.
          </p>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Loading schedule…</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}{" "}
            <button className="underline" onClick={() => void refetch()}>
              Retry
            </button>
          </p>
        ) : null}
        {effective ? (
          <>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={effective.enabled}
                onChange={(event) => setSchedule({ ...effective, enabled: event.target.checked })}
              />
              Enable nightly Ruth Cloud run
            </label>
            <label className="grid max-w-xs gap-1.5 text-sm">
              Cron expression
              <Input
                value={effective.schedule._tag === "cron" ? effective.schedule.expression : ""}
                onChange={(event) =>
                  setSchedule({
                    ...effective,
                    schedule: { _tag: "cron", expression: event.target.value },
                  })
                }
              />
            </label>
            <label className="grid max-w-md gap-1.5 text-sm">
              Time zone
              <select
                className="h-9 border border-input bg-background px-3 text-sm"
                value={effective.timeZone}
                onChange={(event) => setSchedule({ ...effective, timeZone: event.target.value })}
              >
                {timeZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone === localTimeZone ? `${zone} (local)` : zone}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <Button onClick={() => void saveSchedule()} disabled={saving}>
                {saving ? "Saving…" : "Save schedule"}
              </Button>
              {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            </div>
          </>
        ) : null}
      </section>
      {typeof window !== "undefined" && window.avenire ? (
        <section className="grid max-w-md gap-3 py-6">
          <div>
            <h2 className="font-medium">Capture shortcut</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set the desktop hotkey that captures your current study context.
            </p>
          </div>
          <label className="grid gap-1.5 text-sm">
            Shortcut
            <Input
              value={shortcut}
              onChange={(event) => setShortcut(event.target.value)}
              placeholder="CommandOrControl+Shift+Space"
            />
          </label>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => void saveShortcut()}>
              Save shortcut
            </Button>
            {shortcutMessage ? (
              <p className="text-sm text-muted-foreground">{shortcutMessage}</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}
