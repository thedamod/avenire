"use client";

import { Kbd, KbdGroup } from "@avenire/ui/components/kbd";
import { useEffect, useState } from "react";

/** Display the shortcut Electron actually registered, including custom accelerators. */
export function CaptureShortcutKeys({ hint = false }: { hint?: boolean }) {
  const [shortcut, setShortcut] = useState<string | null>();
  const [mac, setMac] = useState(false);
  useEffect(() => {
    let active = true;
    const bridge = window.avenire;
    if (!bridge) return;
    const refresh = () => {
      void bridge
        .getCaptureShortcut()
        .then((value) => {
          if (active) {
            setShortcut(value);
            setMac(bridge.platform === "darwin");
          }
        })
        .catch(() => {
          if (active) setShortcut(null);
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  if (shortcut === undefined) return null;
  if (!shortcut)
    return (
      <span className="text-xs text-muted-foreground">
        {hint ? "Capture shortcut unavailable" : "Unavailable"}
      </span>
    );
  return (
    <>
      {hint ? "Press " : null}
      <ShortcutKeycaps
        shortcut={shortcut}
        mac={mac}
        keyClassName={hint ? "h-5 min-w-5 text-[11px]" : undefined}
      />
      {hint ? " anywhere to capture" : null}
    </>
  );
}

/** An Electron accelerator as keycaps, with the platform's own modifier names. */
export function ShortcutKeycaps({
  shortcut,
  mac,
  keyClassName,
}: {
  shortcut: string;
  mac: boolean;
  keyClassName?: string | undefined;
}) {
  const labels: Record<string, string> = {
    CommandOrControl: mac ? "⌘" : "Ctrl",
    CmdOrCtrl: mac ? "⌘" : "Ctrl",
    Command: "⌘",
    Cmd: "⌘",
    Control: "Ctrl",
    Alt: mac ? "⌥" : "Alt",
    Option: mac ? "⌥" : "Alt",
    Shift: mac ? "⇧" : "Shift",
    Super: mac ? "⌘" : "Super",
  };
  return (
    <KbdGroup>
      {shortcut.split("+").map((key) => (
        <Kbd key={key} className={keyClassName}>
          {labels[key] ?? key}
        </Kbd>
      ))}
    </KbdGroup>
  );
}
