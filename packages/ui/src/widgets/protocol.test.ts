import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "@effect/vitest";
import * as Option from "effect/Option";
import { THEME_TOKENS } from "../styles/tokens.ts";
import { buildWidgetDocument, decodeWidgetMessage, WIDGET_RESPONSE_CSP } from "./protocol.ts";

const build = (html: string, title = "Example") =>
  buildWidgetDocument({ html, title, colorScheme: "light", tokens: THEME_TOKENS.light });

describe("widget protocol", () => {
  it("accepts valid messages and rejects malformed, non-finite and oversize data", () => {
    for (const data of [
      { type: "avenire:widget:ready" },
      { type: "avenire:widget:height", height: 0 },
      { type: "avenire:widget:height", height: 20000 },
      { type: "avenire:widget:error", message: "x".repeat(2000) },
    ])
      expect(Option.isSome(decodeWidgetMessage(data))).toBe(true);
    for (const data of [
      null,
      [],
      {},
      { type: "avenire:widget:height", height: "12" },
      ...[-1, 20001, NaN, Infinity].map((height) => ({ type: "avenire:widget:height", height })),
      { type: "avenire:widget:error", message: "x".repeat(2001) },
    ])
      expect(Option.isNone(decodeWidgetMessage(data))).toBe(true);
    expect(
      Option.isNone(
        decodeWidgetMessage({
          get type() {
            throw new Error("hostile getter");
          },
        }),
      ),
    ).toBe(true);
  });
  it("wraps fragments with CSP, theme and bootstrap before user scripts", () => {
    const result = build("<div>Hi</div>");
    expect(result).toMatch(/^<!doctype html><html data-theme="light"><head>/);
    expect(result).toContain("<body><div>Hi</div></body>");
    expect(result).toContain('http-equiv="Content-Security-Policy"');
    for (const text of [
      "connect-src &#39;none&#39;",
      "event.source!==window.parent",
      "ResizeObserver",
      "requestAnimationFrame",
      "avenire:widget:ready",
      "avenire:themechange",
      "unhandledrejection",
    ])
      expect(result).toContain(text);
  });
  it("injects full documents, including missing heads, before their scripts", () => {
    for (const html of [
      "<!doctype html><html><head><script>example()</script></head><body>Hi</body></html>",
      "<html><body>Hi</body></html>",
      "<!doctype html><body>Hi</body>",
    ]) {
      const result = build(html);
      expect(result).toContain('data-theme="light"');
      expect(result).toContain('<head><meta charset="utf-8">');
      expect(result.indexOf('id="avenire-theme"')).toBeLessThan(result.indexOf("<body>"));
    }
    const result = build(
      "<!-- <head> --><html><head><title>Old</title></head><body>Hi</body></html>",
    );
    expect(result).toMatch(/^<!-- <head> --><html data-theme="light"><head><meta/);
    expect(build("<template><head>fake</head></template><p>Hi</p>")).toContain("<body><template>");
  });
  it("escapes title and drops malicious token names and values", () => {
    const result = buildWidgetDocument({
      html: "Hi",
      title: '</title><script>attack()</script>&"',
      colorScheme: "dark",
      tokens: {
        "--safe": "1rem",
        "bad-name": "red",
        "--attack": "</style><script>attack()</script>",
        "--semicolon": "red;display:none",
        "--brace": "red}",
        "--open": "red{",
      },
    });
    expect(result).toContain("&lt;/title&gt;&lt;script&gt;attack()&lt;/script&gt;&amp;&quot;");
    expect(result).toContain("--safe:1rem;");
    for (const name of ["bad-name", "--attack", "--semicolon", "--brace", "--open"])
      expect(result).not.toContain(name);
  });
  it("embeds complete light and dark tokens", () => {
    for (const colorScheme of ["light", "dark"] as const) {
      const result = buildWidgetDocument({
        html: "",
        title: "",
        colorScheme,
        tokens: THEME_TOKENS[colorScheme],
      });
      expect(result).toContain(`color-scheme:${colorScheme}`);
      expect(result).toContain(`--background:${THEME_TOKENS[colorScheme]["--background"]};`);
      expect(result).toContain("--font-sans:");
    }
  });
  it("limits CSP script sources and keeps an opaque sandbox", () => {
    const csp = WIDGET_RESPONSE_CSP({
      kitsOrigin: "https://widgets.example.com",
      frameAncestors: ["https://app.example.com"],
    });
    expect(csp).toContain("sandbox allow-scripts;");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("script-src 'unsafe-inline' https://widgets.example.com/kits/");
    expect(csp).toContain("frame-ancestors https://app.example.com");
    expect(WIDGET_RESPONSE_CSP({ frameAncestors: [] })).toContain("frame-ancestors 'none'");
    expect(() =>
      WIDGET_RESPONSE_CSP({
        kitsOrigin: "https://example.com/; connect-src *",
        frameAncestors: [],
      }),
    ).toThrow();
    expect(() => WIDGET_RESPONSE_CSP({ frameAncestors: ["*"] })).toThrow();
    expect(() =>
      WIDGET_RESPONSE_CSP({ kitsOrigin: "https://example.com;", frameAncestors: [] }),
    ).toThrow();
  });
});

function bootstrapHarness() {
  type Listener = (event: Record<string, unknown>) => void;
  const listeners: Record<string, Listener> = {};
  const documentListeners: Record<string, Listener> = {};
  const parent = { postMessage: vi.fn() };
  const style = { textContent: "initial" };
  const root = { dataset: { theme: "light" } };
  const body = { height: 172, getBoundingClientRect: () => ({ height: body.height }) };
  const dispatchEvent = vi.fn();
  const frames: Array<() => void> = [];
  const observers: Array<() => void> = [];
  const observe = vi.fn();
  const window = {
    parent,
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
    dispatchEvent,
    ResizeObserver: true,
  };
  const script = /<script>([\s\S]*?)<\/script>/.exec(build(""))![1]!;
  runInNewContext(script, {
    parent,
    window,
    document: {
      documentElement: root,
      body,
      getElementById: () => style,
      querySelectorAll: () => [],
      addEventListener: (type: string, listener: Listener) => {
        documentListeners[type] = listener;
      },
    },
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    getComputedStyle: () => ({ marginTop: "4px", marginBottom: "4px" }),
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe = observe;
    },
    CustomEvent: class {
      readonly type: string;
      readonly options: unknown;
      constructor(type: string, options: unknown) {
        this.type = type;
        this.options = options;
      }
    },
  });
  return {
    parent,
    style,
    root,
    body,
    dispatchEvent,
    frames,
    observers,
    listeners,
    documentListeners,
  };
}

it("bootstrap validates parent themes, sanitizes updates and dispatches themechange", () => {
  const h = bootstrapHarness();
  const data = {
    type: "avenire:theme",
    colorScheme: "dark",
    tokens: { "--foreground": "oklch(0.94 0.012 82)", "--bad": "red;display:none" },
  };
  h.listeners.message!({ source: {}, data });
  expect(h.style.textContent).toBe("initial");
  h.listeners.message!({ source: h.parent, data: { ...data, colorScheme: "invalid" } });
  h.listeners.message!({ source: h.parent, data: { ...data, tokens: { "--foreground": 1 } } });
  expect(h.style.textContent).toBe("initial");
  h.listeners.message!({ source: h.parent, data });
  expect(h.style.textContent).toContain("--foreground:oklch(0.94 0.012 82);");
  expect(h.style.textContent).not.toContain("--bad");
  expect(h.root.dataset.theme).toBe("dark");
  expect(h.dispatchEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: "avenire:themechange" }),
  );
});

it("bootstrap posts ready, debounces heights, avoids duplicates and bounds runtime errors", () => {
  const h = bootstrapHarness();
  h.listeners.load!({});
  expect(h.parent.postMessage).toHaveBeenCalledWith({ type: "avenire:widget:ready" }, "*");
  h.observers[0]!();
  h.observers[0]!();
  expect(h.frames).toHaveLength(1);
  h.frames.shift()!();
  expect(h.parent.postMessage).toHaveBeenLastCalledWith(
    { type: "avenire:widget:height", height: 180 },
    "*",
  );
  const count = h.parent.postMessage.mock.calls.length;
  h.observers[0]!();
  h.frames.shift()!();
  expect(h.parent.postMessage).toHaveBeenCalledTimes(count);
  h.body.height = 242;
  h.observers[0]!();
  h.frames.shift()!();
  expect(h.parent.postMessage).toHaveBeenLastCalledWith(
    { type: "avenire:widget:height", height: 250 },
    "*",
  );
  h.listeners.error!({ message: "x".repeat(3000) });
  expect(h.parent.postMessage).toHaveBeenLastCalledWith(
    { type: "avenire:widget:error", message: "x".repeat(2000) },
    "*",
  );
  h.listeners.unhandledrejection!({ reason: "rejected" });
  expect(h.parent.postMessage).toHaveBeenLastCalledWith(
    { type: "avenire:widget:error", message: "rejected" },
    "*",
  );
});
