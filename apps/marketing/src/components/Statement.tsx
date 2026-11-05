import { statement } from "../content.ts";
import { Column } from "./Section.tsx";
import { TwoTone } from "./Type.tsx";

export function Statement() {
  return (
    <section className="border-border relative border-t pt-30 pb-28">
      <Column>
        <TwoTone
          size="subhead"
          dim={statement.dim}
          bright={statement.bright}
          className="max-w-statement"
        />
      </Column>
    </section>
  );
}
