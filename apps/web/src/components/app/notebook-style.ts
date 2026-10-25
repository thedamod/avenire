import type { FolderColor } from "@avenire/contracts";

/** Cover fills. Notebook covers are the only saturated colour in the app besides Ruth. */
export const NOTEBOOK_COLORS: Record<FolderColor, string> = {
  blue: "#2B9BD8",
  pink: "#EF4579",
  green: "#2E8B47",
  yellow: "#D9A50D",
  purple: "#B48BF2",
  orange: "#E8842C",
  teal: "#2BB5A5",
  gray: "#A3A3A3",
};

export const NOTEBOOK_COLOR_ORDER = Object.keys(NOTEBOOK_COLORS) as FolderColor[];

export function notebookColor(color: FolderColor | null | undefined): string {
  return color ? NOTEBOOK_COLORS[color] : "#6E6E6E";
}
