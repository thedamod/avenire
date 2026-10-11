// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WidgetFrame } from "./WidgetFrame.tsx";

const props = {
  url: "about:blank#token",
  title: "Example chart",
  colorScheme: "light" as const,
  tokens: { "--foreground": "black" },
};
const iframe = () => screen.getByTitle(props.title) as HTMLIFrameElement;
function message(data: unknown, source: MessageEventSource | null = iframe().contentWindow) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, source }));
  });
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("WidgetFrame", () => {
  it("uses only allow-scripts and reserves accessible initial height", () => {
    render(<WidgetFrame {...props} />);
    expect(iframe().getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe().getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(iframe().getAttribute("allow")).toBe("");
    expect(screen.getByRole("figure", { name: props.title }).style.height).toBe("320px");
  });
  it("ignores foreign and invalid messages and clamps own heights", () => {
    render(<WidgetFrame {...props} maxHeight={500} />);
    const figure = screen.getByRole("figure");
    message({ type: "avenire:widget:height", height: 900 }, window);
    message({ type: "avenire:widget:height", height: Infinity });
    expect(figure.style.height).toBe("320px");
    message({ type: "avenire:widget:height", height: 240 });
    expect(figure.style.height).toBe("240px");
    message({ type: "avenire:widget:height", height: 900 });
    expect(figure.style.height).toBe("500px");
    message({ type: "avenire:widget:height", height: 0 });
    expect(figure.style.height).toBe("40px");
  });
  it("posts the current theme on ready and after theme changes", () => {
    const { rerender } = render(<WidgetFrame {...props} />);
    const post = vi.spyOn(iframe().contentWindow!, "postMessage");
    message({ type: "avenire:widget:ready" }, window);
    expect(post).not.toHaveBeenCalled();
    message({ type: "avenire:widget:ready" });
    expect(post).toHaveBeenLastCalledWith(
      { type: "avenire:theme", colorScheme: "light", tokens: props.tokens },
      "*",
    );
    const tokens = { "--foreground": "white" };
    rerender(<WidgetFrame {...props} colorScheme="dark" tokens={tokens} />);
    expect(post).toHaveBeenLastCalledWith(
      { type: "avenire:theme", colorScheme: "dark", tokens },
      "*",
    );
  });
  it("shows timeout failure, calls onError once and remounts on Retry", () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    render(<WidgetFrame {...props} loadTimeoutMs={100} onError={onError} />);
    const original = iframe();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByRole("alert").textContent).toContain("This visual couldn't load.");
    expect(onError).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(iframe()).not.toBe(original);
    expect(screen.queryByRole("alert")).toBeNull();
    message({ type: "avenire:widget:ready" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("shows runtime errors only from its own frame", () => {
    const onError = vi.fn();
    render(<WidgetFrame {...props} onError={onError} />);
    message({ type: "avenire:widget:error", message: "Broken canvas" }, window);
    expect(screen.queryByRole("alert")).toBeNull();
    message({ type: "avenire:widget:error", message: "Broken canvas" });
    expect(screen.getByRole("alert").textContent).toContain("Broken canvas");
    expect(onError).toHaveBeenCalledWith("Broken canvas");
  });
  it("handles iframe errors and starts a fresh lifecycle on URL change", () => {
    const { rerender } = render(<WidgetFrame {...props} />);
    fireEvent.error(iframe());
    expect(screen.getByRole("alert")).toBeTruthy();
    rerender(<WidgetFrame {...props} url="about:blank#other" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(iframe().src).toContain("#other");
  });
});
