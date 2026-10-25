"use client";

import { useState, type ReactElement } from "react";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { toast } from "sonner";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { ItemContextMenu } from "~/components/app/ItemContextMenu";
import { ResponsiveDialog } from "~/components/app/ResponsiveDialog";
import { errorMessage, useApi, useQuery } from "~/lib/rpc";
import type { ActivityItem } from "./activity";
import { buildActivityActions } from "./activityActions";
import { DeleteActivityDialog } from "./DeleteActivityDialog";

export function copyActivityLink(href: string) {
  void navigator.clipboard
    .writeText(new URL(href, window.location.origin).href)
    .then(() => toast("Link copied"))
    .catch((cause: unknown) => toast.error(`Couldn't copy link: ${errorMessage(cause)}`));
}

export function ActivityItemContextMenu({
  item,
  children,
}: {
  item: ActivityItem;
  children: ReactElement;
}) {
  if (item.kind === "chat")
    return <ChatItemContextMenu item={item}>{children}</ChatItemContextMenu>;
  return (
    <ItemContextMenu
      actions={buildActivityActions({
        kind: "run",
        href: item.href,
        succeeded: item.run.status === "succeeded",
        handlers: {
          newTab: () => {},
          rename: () => {},
          remove: () => {},
          copy: () => copyActivityLink(item.href),
        },
      })}
    >
      {children}
    </ItemContextMenu>
  );
}

function ChatItemContextMenu({
  item,
  children,
}: {
  item: Extract<ActivityItem, { kind: "chat" }>;
  children: ReactElement;
}) {
  const api = useApi();
  const threads = useQuery((client) => client["ruth.listThreads"](), "library-threads");
  const [dialog, setDialog] = useState<"rename" | "delete">();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function mutate(remove: boolean) {
    if (busy || (!remove && !title.trim())) return;
    setBusy(true);
    const previous = threads.data?.find((thread) => thread.id === item.thread.id) ?? item.thread;
    threads.setData((rows) =>
      remove
        ? rows?.filter((row) => row.id !== previous.id)
        : rows?.map((row) => (row.id === previous.id ? { ...row, title: title.trim() } : row)),
    );
    try {
      if (remove)
        await call(api, (client) => client["ruth.deleteThread"]({ threadId: previous.id }));
      else
        await call(api, (client) =>
          client["ruth.renameThread"]({ threadId: previous.id, title: title.trim() }),
        );
      setDialog(undefined);
    } catch (cause) {
      threads.setData((rows) =>
        rows
          ? remove
            ? [previous, ...rows.filter((row) => row.id !== previous.id)]
            : rows.map((row) => (row.id === previous.id ? previous : row))
          : rows,
      );
      toast.error(errorMessage(cause));
    } finally {
      setBusy(false);
      invalidateLibrary(api, ["threads"]);
    }
  }

  return (
    <>
      <ItemContextMenu
        actions={buildActivityActions({
          kind: item.kind,
          href: item.href,
          busy,
          handlers: {
            newTab: () => {
              window.open(item.href, "_blank", "noopener,noreferrer");
            },
            copy: () => copyActivityLink(item.href),
            rename: () => {
              setTitle(item.title);
              setDialog("rename");
            },
            remove: () => setDialog("delete"),
          },
        })}
      >
        {children}
      </ItemContextMenu>
      <ResponsiveDialog
        open={dialog === "rename"}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title="Rename chat"
      >
        <form
          className="flex flex-col gap-4 px-5 py-5 md:px-6 md:pb-6"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(false);
          }}
        >
          <Input
            autoFocus
            aria-label="Chat name"
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setDialog(undefined)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !title.trim()}>
              Save
            </Button>
          </div>
        </form>
      </ResponsiveDialog>
      <DeleteActivityDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title="Delete chat?"
        description="This chat and its messages will be permanently deleted. This can't be undone."
        busy={busy}
        onConfirm={() => void mutate(true)}
      />
    </>
  );
}
