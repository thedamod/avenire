import { expect, it, vi } from "vite-plus/test";
import { captureUploadSession } from "./session.ts";

it("pins uploads to the verified owner's cookie snapshot and rejects other destinations", async () => {
  const request = vi.fn(async () => Response.json({ user: { id: "owner-a" } }));
  const get = vi.fn(async () => [{ name: "better-auth.session_token", value: "fixture-a" }]);
  const session = { cookies: { get }, fetch: request } as unknown as Pick<
    Electron.Session,
    "cookies" | "fetch"
  >;
  const upload = await captureUploadSession(session, "https://app.test", "owner-a");
  get.mockResolvedValue([{ name: "better-auth.session_token", value: "fixture-b" }]);
  await upload("https://app.test/api/library/uploads", { method: "POST" });
  const init = (request.mock.calls as unknown as [string, RequestInit][]).at(-1)![1];
  expect(init.credentials).toBe("omit");
  expect(new Headers(init.headers).get("cookie")).toBe("better-auth.session_token=fixture-a");
  expect(new Headers(init.headers).get("origin")).toBe("https://app.test");
  expect(() => upload("https://attacker.test/uploads", {})).toThrow("target Avenire");
});

it("refuses to transfer bytes after the authenticated owner changes", async () => {
  const session = {
    cookies: { get: async () => [{ name: "cookie", value: "fixture" }] },
    fetch: async () => Response.json({ user: { id: "owner-b" } }),
  } as unknown as Pick<Electron.Session, "cookies" | "fetch">;
  await expect(captureUploadSession(session, "https://app.test", "owner-a")).rejects.toThrow(
    "account changed",
  );
});
