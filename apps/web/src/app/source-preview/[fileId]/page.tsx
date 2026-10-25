import type { Metadata } from "next";
import { Suspense } from "react";
import { SourceEmbed } from "~/features/source-embed/SourceEmbed";

export const metadata: Metadata = {
  title: "PDF preview",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** The fragment carries a signed byte URL; this route deliberately has no app layout. */
export default async function Page({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  return (
    <Suspense>
      <SourceEmbed key={fileId} fileId={fileId} />
    </Suspense>
  );
}
