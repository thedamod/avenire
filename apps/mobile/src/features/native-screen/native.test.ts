import { beforeEach, expect, it, vi } from "vite-plus/test";
const native = vi.hoisted(() => ({
  Platform: { OS: "android" },
  NativeModules: {} as Record<string, unknown>,
}));
vi.mock("react-native", () => native);
import { nativeScreenBridge } from "./native";
beforeEach(() => {
  native.Platform.OS = "android";
  native.NativeModules = {};
});
it("does not expose Android shortcuts on other platforms", () => {
  native.Platform.OS = "ios";
  expect(nativeScreenBridge()).toBeUndefined();
});
it("handles an explicitly disabled native build", () => {
  expect(nativeScreenBridge()).toBeUndefined();
});
it("rejects an older installed bridge without the policy gate after an OTA", () => {
  native.NativeModules.AvenireScreen = { presentAnnotations: vi.fn() };
  expect(nativeScreenBridge()).toBeUndefined();
});
it("accepts a bridge with trigger setup and the screen-policy gate", () => {
  const bridge = {
    presentAnnotations: vi.fn(),
    getTriggerStatus: vi.fn(),
    canShareScreen: vi.fn(),
  };
  native.NativeModules.AvenireScreen = bridge;
  expect(nativeScreenBridge()).toBe(bridge);
});
