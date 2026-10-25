import type { FolderColor } from "@avenire/contracts";

// Same cover palette as web; promote to the shared kit when its owner merges.
const fills: Record<FolderColor, string> = {
  blue: "#2B9BD8",
  pink: "#EF4579",
  green: "#2E8B47",
  yellow: "#D9A50D",
  purple: "#B48BF2",
  orange: "#E8842C",
  teal: "#2BB5A5",
  gray: "#A3A3A3",
};
export function notebookColor(color: FolderColor) {
  return fills[color];
}
