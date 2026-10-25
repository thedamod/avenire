import type { Metadata } from "next";
import { Suspense } from "react";
import type { FileId } from "@avenire/contracts";
import { SourcePage } from "~/features/sources/SourcePage";

export const metadata: Metadata = { title: "Source" };

export default async function Page({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  // useSearchParams (?page, ?t, ?region, ?q) needs a Suspense boundary.
  return (
    <Suspense>
      <SourcePage key={fileId} fileId={fileId as FileId} />
    </Suspense>
  );
}
