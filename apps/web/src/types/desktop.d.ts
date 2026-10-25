import type { AvenireDesktopBridge } from "@avenire/desktop/bridge";

declare global {
  interface Window {
    avenire?: AvenireDesktopBridge;
  }
  interface Navigator {
    /** Window Controls Overlay (Chromium); Electron enables it with `titleBarOverlay`. */
    readonly windowControlsOverlay?: { readonly visible: boolean };
  }
}

export {};
