import { afterEach, expect, it, vi } from "vite-plus/test";
import { DesktopAuth, isProviderAuthUrl } from "./auth.ts";
const mocks = vi.hoisted(() => ({ open: vi.fn(async (_url: string) => {}) }));
vi.mock("electron", () => ({ shell: { openExternal: mocks.open } }));
let auth: DesktopAuth | undefined;
afterEach(() => auth?.close());

it("restricts provider interception to credential-free Google HTTPS URLs", () => {
  expect(isProviderAuthUrl("https://accounts.google.com/o/oauth2/auth")).toBe(true);
  for (const url of [
    "http://accounts.google.com/",
    "https://accounts.google.com.evil.test/",
    "https://user@accounts.google.com/",
    "file:///secret",
  ])
    expect(isProviderAuthUrl(url)).toBe(false);
});

it("binds sign-in to a private loopback challenge, verifies one token and installs application cookies", async () => {
  const verify = vi.fn(
    async () =>
      new Response("{}", {
        headers: {
          "set-cookie":
            "__Secure-better-auth.session_token=fixture; Path=/; HttpOnly; Secure; Max-Age=3600",
        },
      }),
  );
  const set = vi.fn(async () => {});
  const complete = vi.fn();
  const failed = vi.fn();
  auth = new DesktopAuth(
    "https://app.test",
    { fetch: verify, cookies: { set } } as unknown as Electron.Session,
    complete,
    failed,
  );
  await auth.start();
  const browserUrl = new URL(mocks.open.mock.calls[0]![0] as unknown as string);
  expect(browserUrl.pathname).toBe("/desktop/authorize");
  const local = new URL(`http://127.0.0.1:${browserUrl.searchParams.get("port")}/callback`);
  local.searchParams.set("state", "0".repeat(64));
  local.searchParams.set("token", "fixture-token-123456");
  expect((await fetch(local)).status).toBe(400);
  expect(verify).not.toHaveBeenCalled();
  local.searchParams.set("state", browserUrl.searchParams.get("state")!);
  const response = await fetch(local);
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain("fixture-token");
  await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(set).toHaveBeenCalledWith(
    expect.objectContaining({
      url: "https://app.test",
      name: "__Secure-better-auth.session_token",
      httpOnly: true,
      secure: true,
    }),
  );
  expect(failed).not.toHaveBeenCalled();
  expect(verify).toHaveBeenCalledOnce();
});
