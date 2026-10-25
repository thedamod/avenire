"use client";
import { useLayoutEffect, useRef } from "react";
import { MeshGradient } from "./MeshGradient";
import { wordmark } from "./wordmark";

export function Wordmark() {
  const svg = useRef<SVGSVGElement>(null);
  const startedHere = useRef(false);
  useLayoutEffect(() => {
    let played = false;
    try {
      played = sessionStorage.getItem("avenire-wordmark") === "1";
      sessionStorage.setItem("avenire-wordmark", "1");
    } catch {
      /* Storage can be disabled. */
    }
    if (
      (played && !startedHere.current) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    startedHere.current = true;
    const paths = svg.current?.querySelectorAll("path");
    if (!paths) return;
    const main = paths[0];
    const dot = paths[1];
    if (!main || !dot) return;
    const length = main.getTotalLength();
    main.style.strokeDasharray = `${length}`;
    const easing =
      getComputedStyle(main).getPropertyValue("--ease-out").trim() ||
      "cubic-bezier(0.23, 1, 0.32, 1)";
    const draw = main.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
      duration: 2000,
      easing,
    });
    const pop = dot.animate(
      [
        { opacity: 0, transform: "scale(.9)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 180, delay: 1700, fill: "backwards", easing },
    );
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (reduce.matches) {
        draw.cancel();
        pop.cancel();
      }
    };
    reduce.addEventListener("change", stop);
    return () => {
      draw.cancel();
      pop.cancel();
      reduce.removeEventListener("change", stop);
    };
  }, []);
  return (
    <svg
      ref={svg}
      className="auth-wordmark"
      viewBox={wordmark.viewBox}
      role="img"
      aria-label="Avenire"
      fill="none"
      stroke="white"
      strokeWidth={wordmark.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={wordmark.path} />
      <path className="auth-wordmark-dot" d={wordmark.dot} />
    </svg>
  );
}
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell dark">
      <div className="auth-brand">
        <MeshGradient className="auth-mesh" />
        <div className="auth-dim" />
        <Wordmark />
      </div>
      <div className="auth-form-panel">
        <div className="auth-form-container">{children}</div>
      </div>
    </main>
  );
}
