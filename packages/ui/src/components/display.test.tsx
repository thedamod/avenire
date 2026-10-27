// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb.tsx";
import { Button } from "./button.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table.tsx";

afterEach(cleanup);

describe("display primitives", () => {
  it("marks the current breadcrumb and hides separators from assistive tech", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Avenire</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator data-testid="sep" />
          <BreadcrumbItem>
            <BreadcrumbPage>Thermodynamics</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );
    expect(screen.getByRole("navigation").getAttribute("aria-label")).toBe("breadcrumb");
    expect(screen.getByText("Thermodynamics").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("sep").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("sep").querySelector("svg")).not.toBeNull();
  });

  it("renders a semantic table inside a scroll container", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Entropy.md</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("table").parentElement?.dataset.slot).toBe("table-container");
    expect(screen.getByRole("columnheader").className).toContain("text-muted-foreground");
    expect(screen.getByRole("cell").className).toContain("h-10");
  });

  it("puts the control and its addon in one bordered group", () => {
    render(
      <InputGroup size="lg" shape="pill" data-testid="group">
        <InputGroupInput aria-label="email" />
        <InputGroupAddon>
          <Button shape="pill">Join</Button>
        </InputGroupAddon>
      </InputGroup>,
    );
    const group = screen.getByTestId("group");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.className).toContain("h-14");
    expect(group.className).toContain("rounded-full");
    expect(group.className).not.toContain("rounded-xl");
    expect(screen.getByLabelText("email").dataset.slot).toBe("input-group-control");
    expect(screen.getByText("Join").className).toContain("rounded-full");
    expect(screen.getByText("Join").className).not.toContain("rounded-lg");
  });
});
