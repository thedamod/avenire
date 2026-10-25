import { expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  origin: "http://localhost:3000",
  env: {} as Record<string, string>,
}));
vi.mock("electron", () => ({ app: { isPackaged: true, getAppPath: () => "/packaged/avenire" } }));
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  readFileSync: () => JSON.stringify({ appUrl: mocks.origin }),
}));
vi.mock("effect/Effect", async (original) => {
  const Effect = await original<typeof import("effect/Effect")>();
  const ConfigProvider = await import("effect/ConfigProvider");
  return {
    ...Effect,
    runSync: (program: Parameters<typeof Effect.runSync>[0]) =>
      Effect.runSync(
        Effect.provideService(
          program,
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown(mocks.env),
        ),
      ),
  };
});

it("keeps the build's WSL URL when launched without the build terminal's environment", async () => {
  mocks.env = {};
  vi.resetModules();
  expect((await import("./config.ts")).appUrl).toBe("http://localhost:3000");
});

it("keeps a deployed build's HTTPS origin", async () => {
  mocks.origin = "https://deployed.avenire.example";
  mocks.env = {};
  vi.resetModules();
  expect((await import("./config.ts")).appUrl).toBe("https://deployed.avenire.example");
});

it("allows an explicit runtime override", async () => {
  mocks.env = { AVENIRE_APP_URL: "http://127.0.0.1:3100" };
  vi.resetModules();
  expect((await import("./config.ts")).appUrl).toBe("http://127.0.0.1:3100");
});
