// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Badge } from "./badge.tsx";
import { Button } from "./button.tsx";
import { Card, CardTitle } from "./card.tsx";
import { Chip } from "./chip.tsx";
import { Input } from "./input.tsx";
import { Kbd } from "./kbd.tsx";

afterEach(cleanup);

describe("core primitives", () => {
  it("renders every button variant and size with the 32px base", () => {
    render(
      <>
        <Button>Default</Button>
        <Button variant="ruth" size="sm">
          Ruth
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="more" />
        <Button variant="destructive" size="xl">
          Delete
        </Button>
      </>,
    );
    expect(screen.getByText("Default").className).toContain("h-8");
    expect(screen.getByText("Default").className).toContain("bg-primary");
    expect(screen.getByText("Ruth").className).toContain("bg-ruth");
    expect(screen.getByText("Ruth").className).toContain("h-7");
    expect(screen.getByLabelText("more").className).toContain("size-7");
    expect(screen.getByText("Delete").className).toContain("h-11");
  });

  it("keeps the shadcn badge variants and maps them onto the chip look", () => {
    render(
      <>
        <Badge>default</Badge>
        <Badge variant="secondary">secondary</Badge>
        <Badge variant="destructive">destructive</Badge>
        <Badge variant="outline">outline</Badge>
        <Chip active>active</Chip>
        <Chip variant="ruth">ruth</Chip>
      </>,
    );
    expect(screen.getByText("default").className).toContain("bg-accent");
    expect(screen.getByText("secondary").className).toContain("text-foreground-soft");
    expect(screen.getByText("destructive").className).toContain("border-destructive-line");
    expect(screen.getByText("outline").className).toContain("h-[26px]");
    expect(screen.getByText("active").className).toContain("bg-accent");
    expect(screen.getByText("ruth").className).toContain("bg-ruth-tint");
  });

  it("renders card, input and kbd with the flat v2 look", () => {
    render(
      <Card data-testid="card">
        <CardTitle>Title</CardTitle>
        <Input placeholder="Search" />
        <Kbd>⌘K</Kbd>
      </Card>,
    );
    expect(screen.getByTestId("card").className).toContain("rounded-xl");
    expect(screen.getByTestId("card").className).not.toContain("shadow");
    expect(screen.getByPlaceholderText("Search").className).toContain("h-9");
    expect(screen.getByText("⌘K").className).toContain("border-b-2");
  });
});
