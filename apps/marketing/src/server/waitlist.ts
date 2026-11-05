import { createHash } from "node:crypto";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { Mailer, MailerResend } from "@avenire/emailer/mailer";

const config = Config.all({
  apiKey: Config.Redacted("RESEND_API_KEY"),
  segmentId: Config.String("RESEND_WAITLIST_SEGMENT_ID"),
});

export default {
  async fetch(request: Request): Promise<Response> {
    const redirect = (status: "success" | "error") =>
      new Response(null, {
        status: 303,
        headers: { Location: `/join?status=${status}`, "Cache-Control": "no-store" },
      });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin)
      return new Response("Forbidden", { status: 403 });
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
      return redirect("error");
    if (Number(request.headers.get("content-length") ?? 0) > 4096) return redirect("error");
    try {
      const body = await request.text();
      if (body.length > 4096) return redirect("error");
      const form = new URLSearchParams(body);
      if (form.get("website")) return redirect("success");
      const email = form.get("email")?.trim().toLowerCase() ?? "";
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirect("error");
      const { apiKey, segmentId } = await Effect.runPromise(config);
      const headers = {
        Authorization: `Bearer ${Redacted.value(apiKey)}`,
        "Content-Type": "application/json",
      };
      const contactUrl = `https://api.resend.com/contacts/${encodeURIComponent(email)}`;
      const existing = await fetch(contactUrl, { headers });
      if (existing.status === 404) {
        const created = await fetch("https://api.resend.com/contacts", {
          method: "POST",
          headers,
          body: JSON.stringify({ email, segments: [{ id: segmentId }] }),
        });
        if (!created.ok) throw new Error("Contact creation failed");
      } else if (existing.ok) {
        const added = await fetch(`${contactUrl}/segments/${encodeURIComponent(segmentId)}`, {
          method: "POST",
          headers,
        });
        if (!added.ok) throw new Error("Could not add contact to waitlist");
      } else throw new Error("Contact lookup failed");
      const idempotencyKey = `waitlist/${createHash("sha256").update(email).digest("hex")}`;
      await Effect.runPromise(
        Effect.gen(function* () {
          const mailer = yield* Mailer;
          yield* mailer.send({
            to: email,
            template: "waitlist-welcome",
            props: {},
            idempotencyKey,
          });
        }).pipe(Effect.provide(MailerResend)),
      );
      return redirect("success");
    } catch {
      return redirect("error");
    }
  },
};
