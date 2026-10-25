import { createRoot } from "react-dom/client";
import { DesktopOnboarding } from "./DesktopOnboarding";
import type { AvenireSetupBridge } from "@avenire/desktop/bridge";
import { DesktopFrame } from "../desktop/DesktopFrame";

declare global {
  interface Window {
    avenireSetup: AvenireSetupBridge;
  }
}
createRoot(document.getElementById("root")!).render(
  <DesktopFrame bridge={window.avenireSetup}>
    <DesktopOnboarding bridge={window.avenireSetup} />
  </DesktopFrame>,
);
