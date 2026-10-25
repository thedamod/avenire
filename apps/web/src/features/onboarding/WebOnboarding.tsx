"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@avenire/ui/components/button";
import { call } from "@avenire/client-runtime/rpc";
import type { OnboardingPreferences, UserSettingsPatch } from "@avenire/contracts";
import { cn } from "@avenire/ui/lib/utils";
import { errorMessage, useApi } from "~/lib/rpc";
import {
  AboutStep,
  DoneStep,
  HelloStep,
  MorningStep,
  OnboardingError,
  OnboardingPrimary,
  OnboardingScreen,
  useOnboardingAnswers,
  type SharedStep,
} from "./steps";

const steps: readonly SharedStep[] = ["hello", "about", "morning", "done"];
/** Matches `--duration-popover`, the exit half of a step change. */
const LEAVE_MS = 150;

/** The desktop bridge hands back a settings patch; keep only what first login accepts. */
function fromDesktop(saved: UserSettingsPatch): OnboardingPreferences {
  return {
    ...(saved.studyDescription !== undefined && { studyDescription: saved.studyDescription }),
    ...(saved.materialSources !== undefined && { materialSources: saved.materialSources }),
    ...(saved.resultsReadyBy !== undefined && { resultsReadyBy: saved.resultsReadyBy }),
    timeZone: saved.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(saved.notifications?.morningReport !== undefined && {
      notifications: { morningReport: saved.notifications.morningReport },
    }),
  };
}

/**
 * First-login onboarding for the web app: hello → about → morning → done. In the desktop
 * shell the setup window already asked these, so its answers are saved without showing steps.
 */
export function WebOnboarding() {
  const api = useApi();
  const router = useRouter();
  const answers = useOnboardingAnswers();
  const [step, setStep] = useState<SharedStep>("hello");
  const [leaving, setLeaving] = useState(false);
  // "checking" until the desktop bridge (if any) says whether it has answers to sync.
  const [desktop, setDesktop] = useState<"checking" | "failed" | "none">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const leaveTimer = useRef<number>(undefined);
  const syncing = useRef(false);
  // Each step remounts (keyed content), so its heading takes focus as it arrives. Stable, so
  // re-renders within a step don't pull focus back from the controls.
  const focusHeading = useCallback(
    (node: HTMLHeadingElement | null) => node?.focus({ preventScroll: true }),
    [],
  );

  const complete = useCallback(
    async (preferences: OnboardingPreferences) => {
      await call(api, (client) => client["settings.completeOnboarding"](preferences));
    },
    [api],
  );

  const syncDesktop = useCallback(async () => {
    const bridge = window.avenire;
    if (!bridge?.getOnboardingPreferences) {
      setDesktop("none");
      return;
    }
    if (syncing.current) return;
    syncing.current = true;
    setDesktop("checking");
    setError("");
    try {
      const saved = await bridge.getOnboardingPreferences();
      if (!saved) {
        setDesktop("none");
        return;
      }
      await complete(fromDesktop(saved));
      await bridge.acknowledgeOnboardingPreferences?.();
      router.replace("/");
    } catch (cause) {
      setDesktop("failed");
      setError(`Couldn’t save your desktop setup: ${errorMessage(cause)}`);
    } finally {
      syncing.current = false;
    }
  }, [complete, router]);

  useEffect(() => {
    void syncDesktop();
  }, [syncDesktop]);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const go = (target: SharedStep) => {
    if (leaving) return;
    setError("");
    setLeaving(true);
    leaveTimer.current = window.setTimeout(() => {
      setStep(target);
      setLeaving(false);
    }, LEAVE_MS);
  };
  const next = () => go(steps[Math.min(steps.indexOf(step) + 1, steps.length - 1)]!);

  const finish = async (preferences: OnboardingPreferences) => {
    setBusy(true);
    setError("");
    try {
      await complete(preferences);
      router.replace("/");
    } catch (cause) {
      setError(`Couldn’t finish setup: ${errorMessage(cause)}. Try again.`);
      setBusy(false);
    }
  };
  // Skipping saves only the steps already answered.
  const skip = () => {
    const { studyDescription, materialSources, timeZone } = answers.preferences();
    void finish(
      step === "morning" ? { studyDescription, materialSources, timeZone } : { timeZone },
    );
  };
  const skipButton = (
    <Button variant="ghost" className="onboarding-skip" disabled={busy || leaving} onClick={skip}>
      Skip for now
    </Button>
  );
  const shared = {
    answers,
    headingRef: focusHeading,
    busy,
    disabled: leaving,
    onContinue: next,
    secondary: skipButton,
  };

  const gate = desktop !== "none";
  return (
    <OnboardingScreen
      step={gate ? "hello" : step}
      className={cn("onboarding-web", leaving && "onboarding-leaving")}
      contentKey={gate ? "hello" : step}
    >
      {gate ? (
        <>
          <HelloStep />
          {desktop === "checking" ? (
            <p className="sr-only" role="status">
              Setting up Avenire…
            </p>
          ) : (
            <>
              <OnboardingError>{error}</OnboardingError>
              <div className="onboarding-sync-actions">
                <Button variant="ghost" onClick={() => setDesktop("none")}>
                  Set up here instead
                </Button>
                <OnboardingPrimary busy={false} onClick={() => void syncDesktop()}>
                  Try again
                </OnboardingPrimary>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {step === "hello" ? <HelloStep busy={busy} disabled={leaving} onContinue={next} /> : null}
          {step === "about" ? <AboutStep {...shared} /> : null}
          {step === "morning" ? <MorningStep {...shared} /> : null}
          {step === "done" ? (
            <DoneStep {...shared} onContinue={() => void finish(answers.preferences())} />
          ) : null}
          {error ? <OnboardingError>{error}</OnboardingError> : null}
        </>
      )}
    </OnboardingScreen>
  );
}
