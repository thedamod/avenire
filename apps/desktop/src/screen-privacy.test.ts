import { expect, it, vi } from "vite-plus/test";
import { screenSharingPermission } from "./screen-privacy.ts";
const origin = "https://app.avenire.space/subpath";
const permission = { userId: "owner", sessionId: "session", enabled: false };
it("reads current owner's explicit opt-in over the authenticated exact-origin session", async () => {
  const fetch = vi.fn(async () => Response.json(permission));
  expect(await screenSharingPermission({ fetch } as any, origin, "owner")).toEqual(permission);
  expect(fetch).toHaveBeenCalledWith(
    "https://app.avenire.space/api/settings/screen-sharing",
    expect.objectContaining({ credentials: "include", redirect: "error", cache: "no-store" }),
  );
  fetch.mockResolvedValueOnce(Response.json({ ...permission, enabled: true }));
  expect((await screenSharingPermission({ fetch } as any, origin, "owner")).enabled).toBe(true);
  expect((await screenSharingPermission({ fetch } as any, origin, "owner")).enabled).toBe(false);
});
it("fails closed on sign-out, another owner, missing session, malformed data or fetch failure", async () => {
  const fetch = vi.fn(async () => Response.json(permission));
  await expect(screenSharingPermission({ fetch } as any, origin, undefined)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  await Promise.all(
    [
      Response.json({ ...permission, userId: "other" }),
      Response.json({ ...permission, sessionId: "" }),
      Response.json({ enabled: true }),
      new Response(null, { status: 401 }),
    ].map(async (response) => {
      const failedFetch = vi.fn(async () => response);
      await expect(
        screenSharingPermission({ fetch: failedFetch } as any, origin, "owner"),
      ).rejects.toThrow();
    }),
  );
  fetch.mockRejectedValueOnce(new Error("offline"));
  await expect(screenSharingPermission({ fetch } as any, origin, "owner")).rejects.toThrow(
    "offline",
  );
});
