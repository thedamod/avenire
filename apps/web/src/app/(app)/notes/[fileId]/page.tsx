import type { Metadata } from "next";
import type { FileId } from "@avenire/contracts";
import { NotePage } from "~/features/notes/NotePage";

export const metadata: Metadata = { title: "Note" };

export default async function Page({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  return <NotePage key={fileId} fileId={fileId as FileId} />;
}
