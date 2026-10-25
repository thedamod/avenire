import type { Metadata } from "next";
import { TrashPage } from "~/features/trash/TrashPage";

export const metadata: Metadata = { title: "Trash" };

export default function Page() {
  return <TrashPage />;
}
