"use client";

import { useCallback, useRef, useState, type ReactNode, type Ref } from "react";
import { FileText, GraduationCap, NotebookPen, Plus } from "lucide-react";
import { Button } from "@avenire/ui/components/button";
import { Chip } from "@avenire/ui/components/chip";
import { Input } from "@avenire/ui/components/input";
import { cn } from "@avenire/ui/lib/utils";
import type { DesktopOnboardingPreferences } from "@avenire/contracts";
import { Wordmark } from "../auth/AuthShell";
import { MeshGradient } from "../auth/MeshGradient";
import "../auth/auth.css";
import "./onboarding.css";

/** Steps shared by the desktop setup window and the web `/onboarding` route. */
export type SharedStep = "hello" | "about" | "morning" | "done";
type MaterialSource = DesktopOnboardingPreferences["materialSources"][number];

function YouTubeMark({ className }: { size?: number; className?: string | undefined }) {
  return (
    <svg aria-hidden="true" className={className} width="16" height="12" viewBox="0 0 24 18">
      <rect width="24" height="18" rx="5" fill="#ff0033" />
      <path d="M10 5.5v7l6-3.5z" fill="white" />
    </svg>
  );
}

const subjects = ["Physics", "Engineering", "Medicine", "Economics", "Law", "Computer science"];
const materials = [
  { id: "lms", label: "LMS", hint: "Canvas, Moodle", icon: GraduationCap },
  { id: "pdf", label: "PDFs", icon: FileText },
  { id: "youtube", label: "YouTube", icon: YouTubeMark },
  { id: "notes", label: "Notes apps", icon: NotebookPen },
  { id: "other", label: "Other", icon: Plus },
] as const;

/** 12-hour clock without the period, e.g. `7:30`. */
export const formatClock = (value: number) =>
  `${Math.floor(value / 60) % 12 || 12}:${String(value % 60).padStart(2, "0")}`;

/** The about + morning answers, in the shape both flows save. */
export function useOnboardingAnswers() {
  const [study, setStudy] = useState("");
  const [sources, setSources] = useState<MaterialSource[]>([]);
  const [minutes, setMinutes] = useState(7 * 60);
  const readyBy = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const restore = useCallback((saved: DesktopOnboardingPreferences) => {
    setStudy(saved.studyDescription);
    setSources([...saved.materialSources]);
    const [hour, minute] = saved.resultsReadyBy.split(":").map(Number);
    setMinutes(hour! * 60 + minute!);
  }, []);
  const toggleSource = (id: MaterialSource) =>
    setSources((current) =>
      current.includes(id) ? current.filter((source) => source !== id) : [...current, id],
    );
  const preferences = (): DesktopOnboardingPreferences => ({
    studyDescription: study.trim(),
    materialSources: [...sources],
    resultsReadyBy: readyBy,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return {
    study,
    setStudy,
    sources,
    toggleSource,
    minutes,
    setMinutes,
    readyBy,
    restore,
    preferences,
  };
}
export type OnboardingAnswers = ReturnType<typeof useOnboardingAnswers>;

/** Full-screen frame; hello and done sit on the mesh. */
export function OnboardingScreen({
  step,
  className,
  contentClassName,
  contentKey,
  children,
  aside,
}: {
  step: string;
  className?: string;
  contentClassName?: string;
  contentKey?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const branded = step === "hello" || step === "done";
  return (
    <main
      className={cn(
        "onboarding-screen dark",
        branded && "onboarding-branded",
        step === "done" && "onboarding-complete",
        className,
      )}
      data-step={step}
    >
      {branded ? (
        <>
          <MeshGradient
            className="onboarding-mesh"
            paused
            initialTime={step === "done" ? 7.875 : 2}
            resolutionScale={0.35}
          />
          <div className="onboarding-mesh-dim" />
        </>
      ) : null}
      <div
        key={contentKey}
        className={cn(
          "onboarding-content",
          branded && "onboarding-brand-content",
          contentClassName,
        )}
      >
        {children}
      </div>
      {aside}
    </main>
  );
}

export function OnboardingTitle({
  ref,
  children,
}: {
  ref?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <h1 ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}

export function OnboardingPrimary({
  children = "Continue",
  busy,
  disabled = false,
  onClick,
}: {
  children?: ReactNode;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="default"
      className="onboarding-primary"
      disabled={busy || disabled}
      onClick={onClick}
    >
      {busy ? "Please wait…" : children}
    </Button>
  );
}

interface StepProps {
  busy: boolean;
  /** Extra condition that holds the primary button, e.g. desktop status still loading. */
  disabled?: boolean;
  onContinue: () => void;
}

/** `onContinue` omitted renders the branded hello without a button (a loading state). */
export function HelloStep({ busy, disabled, onContinue }: Partial<StepProps> & { busy?: boolean }) {
  return (
    <>
      <h1 className="sr-only">Welcome to Avenire</h1>
      <Wordmark />
      <p className="onboarding-welcome-copy">Your study material, worked on while you’re away.</p>
      {onContinue ? (
        <OnboardingPrimary busy={busy ?? false} disabled={disabled ?? false} onClick={onContinue} />
      ) : null}
    </>
  );
}

export function AboutStep({
  answers: { study, setStudy, sources, toggleSource },
  headingRef,
  busy,
  disabled = false,
  onContinue,
  secondary,
}: StepProps & {
  answers: OnboardingAnswers;
  headingRef: Ref<HTMLHeadingElement>;
  secondary?: ReactNode;
}) {
  return (
    <>
      <OnboardingTitle ref={headingRef}>About you</OnboardingTitle>
      <div className="onboarding-field">
        <label htmlFor="study">What are you studying?</label>
        <Input
          id="study"
          value={study}
          maxLength={200}
          placeholder="e.g. Physics, second year"
          onChange={(event) => setStudy(event.target.value)}
        />
        <div className="onboarding-subjects">
          {subjects.map((subject) => (
            <Chip
              key={subject}
              asChild
              active={study.toLowerCase().startsWith(subject.toLowerCase())}
              className="onboarding-subject"
            >
              <button
                type="button"
                aria-pressed={study.toLowerCase().startsWith(subject.toLowerCase())}
                onClick={() => setStudy(subject)}
              >
                {subject}
              </button>
            </Chip>
          ))}
        </div>
      </div>
      <div className="onboarding-field onboarding-material-field">
        <p id="materials-label">Where does your material live?</p>
        <div className="onboarding-materials" role="group" aria-labelledby="materials-label">
          {materials.map(({ id, label, icon: Icon, ...item }) => (
            <Button
              key={id}
              variant="outline"
              className={cn(
                "onboarding-material",
                sources.includes(id) && "onboarding-material-selected",
              )}
              aria-pressed={sources.includes(id)}
              onClick={() => toggleSource(id)}
            >
              <Icon size={16} className={id === "youtube" ? "onboarding-youtube" : undefined} />
              {label}
              {"hint" in item ? (
                <span className="onboarding-material-hint">{item.hint}</span>
              ) : null}
            </Button>
          ))}
        </div>
      </div>
      <div className="onboarding-actions">
        {secondary}
        <OnboardingPrimary busy={busy} disabled={disabled || !study.trim()} onClick={onContinue} />
      </div>
    </>
  );
}

export function MorningStep({
  answers: { minutes, setMinutes },
  headingRef,
  busy,
  disabled,
  onContinue,
  secondary,
}: StepProps & {
  answers: OnboardingAnswers;
  headingRef: Ref<HTMLHeadingElement>;
  secondary?: ReactNode;
}) {
  const touchY = useRef<number>(undefined);
  return (
    <>
      <OnboardingTitle ref={headingRef}>Your morning</OnboardingTitle>
      <p className="onboarding-description">
        Ava will have your notes and questions ready by this time.
      </p>
      <div className="onboarding-time-picker" role="group" aria-label="Morning report time">
        <div className="onboarding-time-selection" />
        <div
          className="onboarding-time-column"
          role="listbox"
          tabIndex={0}
          aria-label="Report time"
          aria-activedescendant="onboarding-selected-time"
          onKeyDown={(event) => {
            if (["ArrowUp", "ArrowDown"].includes(event.key)) {
              event.preventDefault();
              setMinutes(
                (current) => (current + (event.key === "ArrowUp" ? -30 : 30) + 1440) % 1440,
              );
            }
          }}
          // A vertical swipe steps the wheel on touch screens, one half hour per 32px.
          onTouchStart={(event) => {
            touchY.current = event.touches[0]?.clientY;
          }}
          onTouchMove={(event) => {
            const y = event.touches[0]?.clientY;
            if (touchY.current === undefined || y === undefined) return;
            const steps = Math.trunc((touchY.current - y) / 32);
            if (!steps) return;
            touchY.current -= steps * 32;
            setMinutes((current) => (((current + steps * 30) % 1440) + 1440) % 1440);
          }}
          onWheel={(event) => {
            if (Math.abs(event.deltaY) > 2)
              setMinutes((current) => (current + (event.deltaY > 0 ? 30 : -30) + 1440) % 1440);
          }}
        >
          {[-2, -1, 0, 1, 2].map((offset) => {
            const value = (minutes + offset * 30 + 1440) % 1440;
            return (
              <button
                type="button"
                role="option"
                aria-selected={offset === 0}
                id={offset === 0 ? "onboarding-selected-time" : undefined}
                key={offset}
                className={cn(
                  "onboarding-time-option",
                  `onboarding-time-offset-${Math.abs(offset)}`,
                )}
                onClick={() => setMinutes(value)}
              >
                {formatClock(value)}
              </button>
            );
          })}
        </div>
        <div className="onboarding-period-column">
          <Button
            variant="ghost"
            aria-pressed={minutes < 720}
            className={cn("onboarding-period", minutes < 720 && "onboarding-period-active")}
            onClick={() => setMinutes((current) => current % 720)}
          >
            AM
          </Button>
          <Button
            variant="ghost"
            aria-pressed={minutes >= 720}
            className={cn("onboarding-period", minutes >= 720 && "onboarding-period-active")}
            onClick={() => setMinutes((current) => (current % 720) + 720)}
          >
            PM
          </Button>
        </div>
      </div>
      <div className="onboarding-actions">
        {secondary}
        <OnboardingPrimary busy={busy} disabled={disabled ?? false} onClick={onContinue} />
      </div>
    </>
  );
}

export function DoneStep({
  answers: { minutes },
  headingRef,
  busy,
  disabled,
  onContinue,
}: StepProps & { answers: OnboardingAnswers; headingRef: Ref<HTMLHeadingElement> }) {
  return (
    <>
      <OnboardingTitle ref={headingRef}>You’re set.</OnboardingTitle>
      <p className="onboarding-done-copy">
        Ava will have something ready by {formatClock(minutes)} {minutes < 720 ? "AM" : "PM"}{" "}
        tomorrow.
      </p>
      <OnboardingPrimary busy={busy} disabled={disabled ?? false} onClick={onContinue}>
        Open Avenire
      </OnboardingPrimary>
    </>
  );
}

export function OnboardingError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="onboarding-error">
      {children}
    </p>
  );
}
