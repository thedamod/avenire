import type { CloudTask } from "@avenire/contracts";
import { ArrowUpRight, Link, Pencil, Play, Pause, Trash2 } from "lucide-react";
import type { ContextAction } from "~/components/app/ItemContextMenu";

export function buildActivityActions({
  kind,
  href,
  succeeded,
  busy = false,
  handlers,
}: {
  kind: "chat" | "run";
  href: string;
  succeeded?: boolean;
  busy?: boolean;
  handlers: { newTab(): void; copy(): void; rename(): void; remove(): void };
}): readonly ContextAction[] {
  const actions: ContextAction[] = [
    {
      label: kind === "run" && succeeded ? "Open report" : "Open",
      icon: ArrowUpRight,
      href,
      group: "open",
    },
  ];
  if (kind === "chat")
    actions.push(
      { label: "Open in new tab", icon: ArrowUpRight, onSelect: handlers.newTab, group: "open" },
      { label: "Rename…", icon: Pencil, onSelect: handlers.rename, disabled: busy, group: "edit" },
    );
  actions.push({ label: "Copy link", icon: Link, onSelect: handlers.copy, group: "share" });
  if (kind === "chat")
    actions.push({
      label: "Delete chat",
      icon: Trash2,
      onSelect: handlers.remove,
      disabled: busy,
      destructive: true,
      group: "delete",
    });
  return actions;
}

export function buildTaskActions(
  task: Pick<CloudTask, "id" | "enabled" | "builtin">,
  busy: boolean,
  h: {
    run(): void;
    toggle(): void;
    edit(): void;
    remove(): void;
  },
): readonly ContextAction[] {
  return [
    { label: "Open", href: `/tasks/${task.id}`, icon: ArrowUpRight, group: "open" },
    { label: "Run now", icon: Play, onSelect: h.run, disabled: busy, group: "edit" },
    {
      label: task.enabled ? "Pause" : "Resume",
      icon: task.enabled ? Pause : Play,
      onSelect: h.toggle,
      disabled: busy,
      group: "edit",
    },
    { label: "Edit schedule…", icon: Pencil, onSelect: h.edit, disabled: busy, group: "edit" },
    ...(!task.builtin
      ? [
          {
            label: "Delete task",
            icon: Trash2,
            onSelect: h.remove,
            disabled: busy,
            destructive: true,
            group: "delete",
          },
        ]
      : []),
  ];
}
