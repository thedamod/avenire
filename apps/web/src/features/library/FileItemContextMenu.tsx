"use client";

import type { ReactElement } from "react";
import { ItemContextMenu } from "~/components/app/ItemContextMenu";
import { contextTargets } from "./contextTargets";
import type { ActionFile } from "./fileActions";
import { useFileActions } from "./useFileActions";
import type { Selection } from "./useSelection";

/** File adapters keep selection outside the menu and resolve targets without mutating it. */
export function FileItemContextMenu({
  file,
  href,
  selection,
  children,
}: {
  file: ActionFile;
  href: string;
  selection: Selection;
  children: ReactElement;
}) {
  const targets = contextTargets(selection.ids, file.id);
  const { actions, dialogs } = useFileActions({
    ids: targets,
    fallback: file,
    href: targets.length === 1 ? href : undefined,
    selected: selection.has(file.id),
    onToggle: () => selection.toggle(file.id),
    onComplete: () => {
      // Preserve an unrelated selection when operating on an unselected row.
      if (selection.has(file.id))
        selection.set([...selection.ids].filter((id) => !targets.includes(id)));
    },
  });
  return (
    <>
      <ItemContextMenu actions={actions}>{children}</ItemContextMenu>
      {dialogs}
    </>
  );
}
