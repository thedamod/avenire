import type { Metadata } from "next";

export const metadata: Metadata = { title: "Quick prompt" };

export default function PromptLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
