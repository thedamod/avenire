"use client";

import { useSyncExternalStore } from "react";

/** Open state of the ⌥ Space overlay, shared app-wide without a provider. */
export interface EphemeralState {
  readonly open: boolean;
  /** Bumped per opening; a new session starts a new thread. */
  readonly session: number;
  /** Optional question to ask immediately. */
  readonly question: string | null;
}

let state: EphemeralState = { open: false, session: 0, question: null };
const listeners = new Set<() => void>();

function set(next: EphemeralState) {
  state = next;
  for (const listener of listeners) listener();
}

export const ephemeralPrompt = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Open (or refocus) the overlay; a question asks it straight away in a fresh session. */
  open(question?: string) {
    const fresh = !state.open || Boolean(question);
    set({
      open: true,
      session: fresh ? state.session + 1 : state.session,
      question: question?.trim() || null,
    });
  },
  close() {
    if (state.open) set({ ...state, open: false, question: null });
  },
  toggle() {
    if (state.open) this.close();
    else this.open();
  },
};

export function useEphemeralState(): EphemeralState {
  return useSyncExternalStore(ephemeralPrompt.subscribe, ephemeralPrompt.get, ephemeralPrompt.get);
}

/** Open the ⌥ Space overlay from anywhere: `useEphemeralPrompt().open("Why…?")`. */
export function useEphemeralPrompt() {
  return {
    open: (question?: string) => ephemeralPrompt.open(question),
    close: () => ephemeralPrompt.close(),
    toggle: () => ephemeralPrompt.toggle(),
  };
}
