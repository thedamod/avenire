import type { Metadata } from "next";
import type { FolderId } from "@avenire/contracts";
import { NotebookPage } from "~/features/notebook/NotebookPage";

export const metadata: Metadata = { title: "Notebook" };

export default async function Page({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  return <NotebookPage key={folderId} folderId={folderId as FolderId} />;
}
