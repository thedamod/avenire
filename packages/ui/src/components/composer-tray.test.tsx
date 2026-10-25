// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./button.tsx";
import {
  ComposerTray,
  ComposerTrayActions,
  ComposerTrayBody,
  ComposerTrayHeader,
  ComposerTrayRow,
} from "./composer-tray.tsx";

afterEach(cleanup);

const tray = (props: { tone?: "ruth" | "danger"; collapsed?: boolean; onToggle?: () => void }) => (
  <ComposerTray tone={props.tone ?? "ruth"} collapsed={props.collapsed ?? false}>
    <ComposerTrayHeader
      icon={<svg data-testid="icon" />}
      title="Move 2 files"
      meta="Biology"
      step="1/2"
      {...(props.onToggle ? { onToggleCollapsed: props.onToggle } : {})}
      action={<Button size="sm">Review</Button>}
    />
    <ComposerTrayBody>
      <ComposerTrayRow label="Option A" detail="first" selected onSelect={() => undefined} />
      <ComposerTrayRow label="Option B" onSelect={() => undefined} />
      <ComposerTrayActions start={<Button variant="ghost">Skip</Button>}>
        <Button>Approve</Button>
      </ComposerTrayActions>
    </ComposerTrayBody>
  </ComposerTray>
);

describe("ComposerTray", () => {
  it("renders the drop-up shell, header parts and tone-coloured icon", () => {
    render(tray({ tone: "danger" }));
    const root = document.querySelector("[data-slot=composer-tray]");
    expect(root?.className).toContain("-mb-4");
    expect(root?.className).toContain("pb-7");
    expect(root?.className).toContain("border-b-0");
    expect(root?.getAttribute("data-tone")).toBe("danger");
    expect(screen.getByTestId("icon").parentElement?.className).toContain("text-destructive");
    expect(screen.getByText("1/2").className).toContain("font-mono");
    expect(screen.getByText("Approve")).toBeTruthy();
    expect(screen.queryByText("Review")).toBeNull();
  });

  it("shows a check on the selected option only", () => {
    render(tray({}));
    expect(screen.getByText("Option A").closest("button")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(document.querySelectorAll("[data-slot=composer-tray-check]")).toHaveLength(1);
  });

  it("hides body and shows the inline action when collapsed", () => {
    const onToggle = vi.fn();
    render(tray({ collapsed: true, onToggle }));
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(
      document.querySelector("[data-slot=composer-tray-body-frame]")?.hasAttribute("inert"),
    ).toBe(true);
    expect(screen.getByText("Review")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Expand"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
