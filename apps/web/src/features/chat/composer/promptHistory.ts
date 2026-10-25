/** Sent prompts for ↑ / ↓ recall in an empty composer (most recent last). */
const KEY = "avenire:prompt-history";
const LIMIT = 50;
let history: string[] | null = null;

function load(): string[] {
  if (history) return history;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    history = Array.isArray(stored) ? stored.filter((item) => typeof item === "string") : [];
  } catch {
    history = [];
  }
  return history;
}

export function rememberPrompt(prompt: string) {
  const clean = prompt.trim();
  if (!clean) return;
  const next = load().filter((item) => item !== clean);
  next.push(clean);
  history = next.slice(-LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(history));
  } catch {
    // Storage unavailable: history lasts for this session.
  }
}

/** Step through history. `cursor` is an index from the end (0 = not browsing). */
export function recallPrompt(cursor: number): string | undefined {
  const items = load();
  return cursor > 0 ? items[items.length - cursor] : undefined;
}

export function historySize(): number {
  return load().length;
}
