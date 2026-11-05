import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? "https://avenire.space",
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
