import { redirect } from "next/navigation";

/** Search lives in the home composer now; keep old `/search?q=` links working. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const query = Array.isArray(q) ? q[0] : q;
  redirect(query ? `/?q=${encodeURIComponent(query)}` : "/");
}
