import { describe, expect, it, vi } from "vite-plus/test";
import { FileId, type CaptureOrigin } from "@avenire/contracts";
import {
  browserReopen,
  hasOriginal,
  originLabel,
  REOPEN_CHANGED,
  REOPEN_MISSING,
  reopenFile,
  savedOn,
  type ReopenEnv,
  type ReopenFile,
} from "./reopen";

const id = FileId.make("0b6f6a8e-3c1f-4f55-9a52-3e0e6d0f6a11");
const web: CaptureOrigin = {
  _tag: "Web",
  url: "https://www.example.com/article?id=7&utm_source=x",
  title: "Article",
  browser: "chrome",
  capturedAt: "2026-10-25T00:00:00Z",
  position: { textQuote: { exact: "the key idea" } },
};
const local: CaptureOrigin = {
  _tag: "LocalFile",
  deviceId: "device-a",
  deviceName: "Abhiram's MacBook",
  platform: "darwin",
  fileName: "lecture-3.pdf",
  appName: "Preview",
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  capturedAt: "2026-10-25T00:00:00Z",
  position: { pdfPage: 4 },
};
const file = (origin: CaptureOrigin | null, sourceUrl: string | null = null): ReopenFile => ({
  id,
  origin,
  sourceUrl,
});

function env(overrides: Partial<ReopenEnv> = {}) {
  return {
    open: vi.fn(),
    navigate: vi.fn(),
    notify: vi.fn(),
    opened: vi.fn(),
    ...overrides,
  } satisfies ReopenEnv;
}

describe("origin labels", () => {
  it("labels a page by hostname and a local file by app and file name", () => {
    expect(originLabel(file(web))).toBe("example.com");
    expect(originLabel(file(local))).toBe("Preview · lecture-3.pdf");
    expect(originLabel(file({ ...local, appName: undefined } as CaptureOrigin))).toBe(
      "lecture-3.pdf",
    );
    expect(originLabel(file(null, "https://arxiv.org/abs/1"))).toBe("arxiv.org");
    expect(originLabel(file(null))).toBeNull();
  });
  it("says which computer a local file was saved on", () => {
    expect(savedOn(file(local))).toBe("Saved on Abhiram's MacBook");
    expect(savedOn(file(web))).toBeNull();
  });
  it("only offers Open original where it leads somewhere", () => {
    expect(hasOriginal(file(web), false)).toBe(true);
    expect(hasOriginal(file(null, "https://arxiv.org/abs/1"), false)).toBe(true);
    expect(hasOriginal(file(local), false)).toBe(false);
    expect(hasOriginal(file(local), true)).toBe(true);
    expect(hasOriginal(file(null, "javascript:alert(1)"), true)).toBe(false);
  });
});

describe("browserReopen", () => {
  it("opens a page at the captured quote, without tracking parameters", () => {
    const plan = browserReopen(file(web));
    expect(plan._tag).toBe("OpenUrl");
    const url = plan._tag === "OpenUrl" ? plan.url : "";
    expect(url).toContain("https://www.example.com/article?id=7");
    expect(url).not.toContain("utm_source");
    expect(url).toContain("#:~:text=the%20key%20idea");
  });
  it("falls back to the library viewer at the captured page for a local file", () => {
    expect(browserReopen(file(local))).toEqual({
      _tag: "OpenInLibrary",
      href: `/sources/${id}?page=4`,
    });
  });
  it("never opens a non-web origin URL", () => {
    expect(browserReopen(file({ ...web, url: "file:///etc/passwd" }))).toEqual({
      _tag: "OpenInLibrary",
      href: `/sources/${id}`,
    });
  });
  it("still opens the address of a file captured before origins existed", () => {
    expect(browserReopen(file(null, "https://arxiv.org/abs/1"))).toEqual({
      _tag: "OpenUrl",
      url: "https://arxiv.org/abs/1",
    });
  });
});

describe("reopenFile", () => {
  it("opens in a new tab in the browser and records the open", async () => {
    const e = env();
    await reopenFile(file(web), e);
    expect(e.open).toHaveBeenCalledWith(expect.stringContaining("example.com/article"));
    expect(e.opened).toHaveBeenCalledWith(id);
    expect(e.navigate).not.toHaveBeenCalled();
  });
  it("opens a local file's stored copy, or its viewer, in the browser", async () => {
    const stored = env({ stored: "https://storage.example/signed" });
    await reopenFile(file(local), stored);
    expect(stored.open).toHaveBeenCalledWith("https://storage.example/signed");
    expect(stored.opened).not.toHaveBeenCalled();

    const away = env({ pathname: "/" });
    await reopenFile(file(local), away);
    expect(away.navigate).toHaveBeenCalledWith(`/sources/${id}?page=4`);

    const here = env({ pathname: `/sources/${id}` });
    await reopenFile(file(local), here);
    expect(here.navigate).not.toHaveBeenCalled();
  });
  it("lets the desktop reopen it, and says when the file changed", async () => {
    const reopen = vi.fn().mockResolvedValue({ ok: true, note: "changed-since-capture" });
    const e = env({ bridge: { reopen } });
    await reopenFile(file(local), e);
    expect(reopen).toHaveBeenCalledWith(id);
    expect(e.notify).toHaveBeenCalledWith(REOPEN_CHANGED);
    expect(e.open).not.toHaveBeenCalled();
    // The desktop records the opened event itself.
    expect(e.opened).not.toHaveBeenCalled();
  });
  it("says when the desktop can't find a local file, then opens it in the library", async () => {
    const reopen = vi.fn().mockResolvedValue({ ok: false, note: "missing" });
    const e = env({ bridge: { reopen }, pathname: "/" });
    await reopenFile(file(local), e);
    expect(e.notify).toHaveBeenCalledWith(REOPEN_MISSING);
    expect(e.navigate).toHaveBeenCalledWith(`/sources/${id}?page=4`);
  });
  it("quietly opens the library copy of a file captured on another computer", async () => {
    const reopen = vi.fn().mockResolvedValue({ ok: false, note: "other-device" });
    const e = env({ bridge: { reopen }, pathname: "/" });
    await reopenFile(file(local), e);
    expect(e.notify).not.toHaveBeenCalled();
    expect(e.navigate).toHaveBeenCalledWith(`/sources/${id}?page=4`);
    expect(e.opened).not.toHaveBeenCalled();
  });
  it("falls back to the browser plan when the desktop can't open a page", async () => {
    const reopen = vi.fn().mockRejectedValue(new Error("ipc"));
    const e = env({ bridge: { reopen } });
    await reopenFile(file(web), e);
    expect(e.notify).not.toHaveBeenCalled();
    expect(e.open).toHaveBeenCalledOnce();
  });
  it("skips the desktop for files without a captured origin", async () => {
    const reopen = vi.fn();
    const e = env({ bridge: { reopen } });
    await reopenFile(file(null, "https://arxiv.org/abs/1"), e);
    expect(reopen).not.toHaveBeenCalled();
    expect(e.open).toHaveBeenCalledWith("https://arxiv.org/abs/1");
  });
});
