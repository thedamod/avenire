import { Button } from "@avenire/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@avenire/ui/components/input-group";
import { emailCta } from "../content.ts";

/** Plain GET form to the app's sign-up page; works without JavaScript. */
export function EmailCta({ id }: { id: string }) {
  return (
    <form action={emailCta.action} method="get" className="max-w-field w-full">
      <label htmlFor={id} className="sr-only">
        Email
      </label>
      <InputGroup size="lg" shape="pill">
        <InputGroupInput
          id={id}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={emailCta.placeholder}
        />
        <InputGroupAddon>
          <Button type="submit" size="xl" shape="pill">
            {emailCta.button}
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
