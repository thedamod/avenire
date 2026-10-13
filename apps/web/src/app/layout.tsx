import type { Metadata } from "next";
// Self-hosted under their plain family names: the tokens (and widgets) say "Inter" and "Lora".
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/400-italic.css";
import "@fontsource/lora/600.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Avenire",
  description: "Your study material, ready when you need it.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
