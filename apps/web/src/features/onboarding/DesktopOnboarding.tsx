"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AppWindow, Bell, Check, FileText, Keyboard, TriangleAlert } from "lucide-react";
import { Button } from "@avenire/ui/components/button";
import { Kbd, KbdGroup } from "@avenire/ui/components/kbd";
import { cn } from "@avenire/ui/lib/utils";
import type { AvenireSetupBridge } from "@avenire/desktop/bridge";
import type { DesktopSetupCapture, DesktopSetupStatus, DesktopShortcuts } from "@avenire/contracts";
import {
  AboutStep,
  DoneStep,
  HelloStep,
  MorningStep,
  OnboardingError,
  OnboardingPrimary,
  OnboardingScreen,
  OnboardingTitle,
  useOnboardingAnswers,
} from "./steps";

const shortcutLabels: Record<string, string> = {
  Alt: "⌥",
  CommandOrControl: "⌘",
  Command: "⌘",
  Control: "Ctrl",
  Shift: "⇧",
};
const steps = [
  "hello",
  "about",
  "morning",
  "shortcuts",
  "hotkeys",
  "windows",
  "notifications",
  "try",
  "done",
] as const;
type Step = (typeof steps)[number];

function ShortcutKeys({
  value,
  mac,
  large = false,
  conflict = false,
}: {
  value: string;
  mac: boolean;
  large?: boolean;
  conflict?: boolean;
}) {
  const label: Record<string, string> = {
    Alt: mac ? "⌥" : "Alt",
    Shift: mac ? "⇧" : "Shift",
    CommandOrControl: mac ? "⌘" : "Ctrl",
    Command: "⌘",
    Control: "Ctrl",
  };
  return (
    <KbdGroup className={cn(large && "gap-2")}>
      {value.split("+").map((key) => (
        <Kbd
          key={key}
          className={cn(
            "onboarding-key",
            large && "onboarding-key-large",
            conflict && "onboarding-key-conflict",
          )}
        >
          {label[key] ?? key}
        </Kbd>
      ))}
    </KbdGroup>
  );
}

/** The existing design-system controls composed to match the desktop onboarding references. */
export function DesktopOnboarding({ bridge }: { bridge: AvenireSetupBridge }) {
  const [step, setStep] = useState<Step>("hello");
  const [status, setStatus] = useState<DesktopSetupStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const answers = useOnboardingAnswers();
  const { restore } = answers;
  const [shortcuts, setShortcuts] = useState<DesktopShortcuts>({
    capture: "Alt+C",
    prompt: "Alt+Space",
  });
  const [recording, setRecording] = useState<"capture" | "prompt">();
  const [foreground, setForeground] = useState(false);
  const [hotkeys, setHotkeys] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [capture, setCapture] = useState<DesktopSetupCapture>();
  const initialized = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const mac = status?.platform === "darwin";
  const count = capture?.sources.length ?? 0;

  const refresh = useCallback(async () => {
    const current = await bridge.getStatus();
    setStatus(current);
    if (!initialized.current) {
      initialized.current = true;
      if (current.requestedShortcuts) setShortcuts(current.requestedShortcuts);
      setForeground(current.foregroundCapture);
      setHotkeys(current.hotkeysEnabled ?? false);
      setNotifications(current.notificationsEnabled ?? false);
      if (current.preferences) restore(current.preferences);
    }
  }, [bridge, restore]);
  useEffect(() => {
    const update = () => {
      void refresh().catch(() =>
        setError("Could not read desktop setup. Reopen Avenire and try again."),
      );
    };
    update();
    window.addEventListener("focus", update);
    const unsubscribe = bridge.onCapture((value) => {
      setCapture(value);
      setError(
        value.sources.length
          ? ""
          : "Nothing captured. Open a supported document or connect your browser, then try again.",
      );
    });
    return () => {
      unsubscribe();
      window.removeEventListener("focus", update);
    };
  }, [bridge, refresh]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    void bridge.setTryCapture(step === "try", foreground);
    return () => {
      void bridge.setTryCapture(false, false);
    };
  }, [step, foreground, bridge]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
          : "Could not finish this step. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const next = () => {
    setError("");
    setStep(steps[Math.min(steps.indexOf(step) + 1, steps.length - 1)]!);
  };
  const updateShortcuts = async (value: DesktopShortcuts) => {
    setShortcuts(value);
    setStatus(await bridge.setShortcuts(value));
  };
  const recordKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    if (event.key === "Escape") {
      setRecording(undefined);
      return;
    }
    if (["Alt", "Control", "Shift", "Meta"].includes(event.key)) return;
    const modifiers = [
      event.metaKey ? "CommandOrControl" : event.ctrlKey ? "Control" : "",
      event.altKey ? "Alt" : "",
      event.shiftKey ? "Shift" : "",
    ].filter(Boolean);
    if (!modifiers.length) {
      setError("Include a modifier key, such as Option or Control.");
      return;
    }
    // Option+letter produces characters such as ç on macOS. Electron needs the physical key.
    const namedKeys: Record<string, string> = {
      ArrowUp: "Up",
      ArrowDown: "Down",
      ArrowLeft: "Left",
      ArrowRight: "Right",
    };
    const key =
      event.code === "Space"
        ? "Space"
        : /^(?:Key[A-Z]|Digit[0-9])$/.test(event.code)
          ? event.code.replace(/^(?:Key|Digit)/, "")
          : (namedKeys[event.key] ?? event.key);
    const value = [...modifiers, key].join("+");
    const target = recording;
    setRecording(undefined);
    void run(() => updateShortcuts({ ...shortcuts, [target]: value }));
  };
  const allowWindows = () =>
    run(async () => {
      let current = await bridge.getStatus();
      if (current.accessibility === "required")
        current = await bridge.requestPermission("accessibility");
      if (current.accessibility === "required") {
        setStatus(current);
        setError("Enable Avenire in System Settings, then choose Allow again.");
        return;
      }
      if (current.automation === "required") current = await bridge.requestPermission("automation");
      setStatus(current);
      if (!current.foregroundAvailable && !current.tabsConnected) {
        setError(current.foregroundNote);
        return;
      }
      setForeground(current.foregroundAvailable);
      next();
    });
  const finish = () =>
    run(async () =>
      bridge.complete({
        foregroundCapture: foreground,
        preferences: answers.preferences(),
        shortcuts,
        hotkeysEnabled: hotkeys,
        notificationsEnabled: notifications,
      }),
    );
  const title = (text: string) => <OnboardingTitle ref={heading}>{text}</OnboardingTitle>;
  const primary = (text = "Continue", action = next, disabled = false) => (
    <OnboardingPrimary busy={busy} disabled={disabled || !status} onClick={action}>
      {text}
    </OnboardingPrimary>
  );
  const shared = { answers, headingRef: heading, busy, disabled: !status, onContinue: next };
  const permission = (
    Icon: typeof Bell,
    text: string,
    description: string,
    allow: () => void,
    skip: () => void,
  ) => (
    <>
      <div className="onboarding-permission-icon">
        <Icon size={20} strokeWidth={1.6} />
      </div>
      {title(text)}
      <p className="onboarding-description">{description}</p>
      <div className="onboarding-permission-actions">
        {primary("Allow", allow)}
        <Button variant="ghost" disabled={busy} onClick={skip}>
          Not now
        </Button>
      </div>
    </>
  );

  const receipt = () => (
    <aside className="onboarding-capture-toast" aria-label="Capture receipt">
      <div className="onboarding-toast-header">
        <ShortcutKeys value={shortcuts.capture} mac={mac} />
        <strong>
          Captured {count} thing{count === 1 ? "" : "s"}
        </strong>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            void run(async () => {
              await bridge.discardCapture();
              setCapture(undefined);
            })
          }
        >
          Undo
        </Button>
      </div>
      <ul>
        {capture!.sources.map((source, index) => (
          <li key={`${source.title}-${index}`}>
            <FileText size={18} strokeWidth={1.5} />
            <span>{source.title}</span>
          </li>
        ))}
      </ul>
      <div className="onboarding-toast-footer">
        <span>In Sources · Unfiled.</span>
        <Button variant="link" onClick={next}>
          Open
        </Button>
      </div>
    </aside>
  );

  return (
    <OnboardingScreen
      step={step}
      contentClassName={cn(
        ["hotkeys", "windows", "notifications"].includes(step) && "onboarding-permission",
      )}
      aside={step === "try" && count ? receipt() : null}
    >
      {step === "hello" ? <HelloStep {...shared} /> : null}
      {step === "about" ? <AboutStep {...shared} /> : null}
      {step === "morning" ? <MorningStep {...shared} /> : null}
      {step === "shortcuts" ? (
        <>
          {title("Shortcuts")}
          <div className="onboarding-shortcut-table">
            {(["capture", "prompt"] as const).map((kind) => (
              <div key={kind} className="onboarding-shortcut-row">
                <span>{kind === "capture" ? "Capture" : "Ask Ruth"}</span>
                <ShortcutKeys
                  value={shortcuts[kind]}
                  mac={mac}
                  conflict={status?.shortcutConflicts?.[kind] ?? false}
                />
                <Button
                  variant="ghost"
                  className="onboarding-change"
                  onClick={() => setRecording(kind)}
                  onKeyDown={recordKey}
                >
                  {recording === kind ? "Press keys…" : "Change"}
                </Button>
              </div>
            ))}
            {status?.shortcutConflicts?.prompt ? (
              <div className="onboarding-shortcut-conflict">
                <span>
                  <TriangleAlert size={14} />
                  Another app already uses {mac ? "⌥" : "Alt"} Space.
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void run(() => updateShortcuts({ ...shortcuts, prompt: "Alt+Shift+Space" }))
                  }
                >
                  Use {mac ? "⌥ ⇧" : "Alt + Shift +"} Space
                </Button>
                <Button variant="ghost" disabled>
                  Keep anyway
                </Button>
              </div>
            ) : null}
            {status?.shortcutConflicts?.capture ? (
              <p className="onboarding-shortcut-error">
                <TriangleAlert size={14} />
                The capture shortcut is already in use. Choose Change to set another.
              </p>
            ) : null}
          </div>
          <div className="onboarding-actions">
            {primary(
              "Continue",
              next,
              Boolean(status?.shortcutConflicts?.capture || status?.shortcutConflicts?.prompt),
            )}
          </div>
        </>
      ) : null}
      {step === "hotkeys"
        ? permission(
            Keyboard,
            "Global hotkeys",
            "So your shortcuts work in any app, not just Avenire.",
            () =>
              void run(async () => {
                setStatus(await bridge.allowHotkeys(true));
                setHotkeys(true);
                next();
              }),
            () =>
              void run(async () => {
                setStatus(await bridge.allowHotkeys(false));
                setHotkeys(false);
                next();
              }),
          )
        : null}
      {step === "windows"
        ? permission(
            AppWindow,
            "Window and tab access",
            "So capture can see what you’re studying.",
            () => void allowWindows(),
            () => {
              setForeground(false);
              next();
            },
          )
        : null}
      {step === "notifications"
        ? permission(
            Bell,
            "Notifications",
            "So you get your morning report.",
            () =>
              void run(async () => {
                const allowed = await bridge.requestNotifications();
                setNotifications(allowed);
                if (allowed) next();
                else
                  setError(
                    "Notifications are unavailable on this computer. You can choose Not now.",
                  );
              }),
            () => {
              setNotifications(false);
              next();
            },
          )
        : null}
      {step === "try" ? (
        <>
          {title("Try it")}
          <p className="onboarding-description">
            Open something you’re studying, then press{" "}
            {shortcuts.capture
              .split("+")
              .map(
                (key) =>
                  (mac ? shortcutLabels[key] : key === "CommandOrControl" ? "Ctrl" : key) ?? key,
              )
              .join(mac ? "" : " + ")}
            .
          </p>
          <div className="onboarding-try-keys">
            <ShortcutKeys value={shortcuts.capture} mac={mac} large />
            {count ? (
              <span className="onboarding-captured" role="status">
                <Check size={14} />
                {count} captured
              </span>
            ) : null}
          </div>
          <div className="onboarding-actions onboarding-try-actions">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await bridge.discardCapture();
                  setCapture(undefined);
                  next();
                })
              }
            >
              Skip, nothing’s open
            </Button>
            {primary("Continue", next, count === 0)}
          </div>
        </>
      ) : null}
      {step === "done" ? <DoneStep {...shared} onContinue={() => void finish()} /> : null}
      {error ? (
        <>
          <OnboardingError>{error}</OnboardingError>
          {step === "hotkeys" ? (
            <Button
              variant="ghost"
              onClick={() => {
                setError("");
                setStep("shortcuts");
              }}
            >
              Change shortcuts
            </Button>
          ) : null}
        </>
      ) : null}
    </OnboardingScreen>
  );
}
