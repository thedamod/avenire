import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
// Self-hosted under their plain family names: the tokens (and widgets) say "Inter" and "Lora".
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/400-italic.css";
import "@fontsource/lora/600.css";
import "./globals.css";
import { desktopChromeScript } from "~/features/desktop/chrome";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Avenire", template: "%s · Avenire" },
  applicationName: "Avenire",
  description: "Your study material, ready when you need it.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0b0b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: desktopChromeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
