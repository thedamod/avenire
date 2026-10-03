import type { AvenireDesktopBridge } from "@avenire/desktop/bridge";

declare global {
  interface Window {
    avenire?: AvenireDesktopBridge;
  }
}

export {};
