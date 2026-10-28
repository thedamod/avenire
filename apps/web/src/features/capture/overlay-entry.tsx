import { createRoot } from "react-dom/client";
import type { AvenireOverlayBridge } from "@avenire/desktop/bridge";
import { CaptureOverlay } from "./CaptureOverlay";

declare global {
  interface Window {
    avenireOverlay: AvenireOverlayBridge;
  }
}
createRoot(document.getElementById("root")!).render(
  <CaptureOverlay bridge={window.avenireOverlay} />,
);
