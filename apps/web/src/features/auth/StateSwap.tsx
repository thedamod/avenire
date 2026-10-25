"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Keep the outgoing state for one short crossfade; only the current state is interactive. */
export function StateSwap({ stateKey, children }: { stateKey: string; children: ReactNode }) {
  const previous = useRef({ key: stateKey, children });
  const current = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState<{ key: string; children: ReactNode } | null>(null);
  useLayoutEffect(() => {
    if (previous.current.key !== stateKey) {
      setLeaving(previous.current);
      current.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    }
    previous.current = { key: stateKey, children };
  }, [stateKey, children]);
  useLayoutEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), 200);
    return () => clearTimeout(timer);
  }, [leaving]);
  return (
    <div className="auth-state-stack">
      <div ref={current} className="auth-swap" key={stateKey}>
        {children}
      </div>
      {leaving && (
        <div
          className="auth-swap auth-swap-leaving"
          aria-hidden
          inert
          key={`leaving-${leaving.key}`}
        >
          {leaving.children}
        </div>
      )}
    </div>
  );
}
