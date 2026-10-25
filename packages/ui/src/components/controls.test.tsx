// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Alert, AlertDescription, AlertTitle } from "./alert.tsx";
import { Checkbox } from "./checkbox.tsx";
import { Progress } from "./progress.tsx";
import { RadioGroup, RadioGroupItem } from "./radio-group.tsx";
import { Slider } from "./slider.tsx";
import { Switch } from "./switch.tsx";
import { Tabs, TabsList, TabsTrigger } from "./tabs.tsx";
import { Toggle } from "./toggle.tsx";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group.tsx";

afterEach(cleanup);

describe("form controls", () => {
  it("applies checked state styles to checkbox, switch and radio", () => {
    render(
      <>
        <Checkbox defaultChecked aria-label="check" />
        <Switch defaultChecked aria-label="switch" />
        <RadioGroup defaultValue="a">
          <RadioGroupItem value="a" aria-label="radio" />
        </RadioGroup>
      </>,
    );
    expect(screen.getByLabelText("check").getAttribute("data-state")).toBe("checked");
    expect(screen.getByLabelText("check").className).toContain("data-[state=checked]:bg-ruth");
    expect(screen.getByLabelText("switch").className).toContain("data-[state=checked]:bg-foreground");
    expect(screen.getByLabelText("radio").getAttribute("data-state")).toBe("checked");
  });

  it("renders progress tones, slider thumbs, toggle and segmented control", () => {
    render(
      <>
        <Progress value={40} tone="ruth" data-testid="progress" />
        <Slider defaultValue={[20, 80]} />
        <Toggle aria-label="bold" defaultPressed />
        <ToggleGroup type="single" defaultValue="a">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
        </ToggleGroup>
      </>,
    );
    expect(
      screen.getByTestId("progress").querySelector("[data-slot=progress-indicator]")?.className,
    ).toContain("bg-ruth");
    expect(document.querySelectorAll("[data-slot=slider-thumb]")).toHaveLength(2);
    expect(screen.getByLabelText("bold").getAttribute("data-state")).toBe("on");
    expect(screen.getByText("A").getAttribute("data-state")).toBe("on");
    expect(screen.getByText("A").className).toContain("h-[30px]");
  });

  it("switches tab list styling by variant", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList data-testid="underline">
          <TabsTrigger value="a">One</TabsTrigger>
        </TabsList>
        <TabsList variant="pill" data-testid="pill">
          <TabsTrigger value="a">Two</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByTestId("underline").className).toContain("border-b");
    expect(screen.getByTestId("pill").getAttribute("data-variant")).toBe("pill");
    expect(screen.getByText("One").className).toContain("border-b-[1.5px]");
    expect(screen.getByText("Two").className).toContain("data-[state=active]:bg-accent");
  });

  it("renders alerts as flat asides with a tone rule", () => {
    render(
      <Alert variant="destructive" data-testid="alert">
        <AlertTitle>Failed</AlertTitle>
        <AlertDescription>Something broke</AlertDescription>
      </Alert>,
    );
    const alert = screen.getByTestId("alert");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.className).toContain("border-l-destructive");
    expect(alert.className).not.toMatch(/\brounded|\bbg-/);
  });
});
