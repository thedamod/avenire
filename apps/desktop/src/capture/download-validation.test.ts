import { realpath, mkdtemp, mkdir, writeFile, stat, symlink, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { validateBrowserDownload } from "./download-validation.ts";

it("accepts only a matching regular download within its capture directory and time window", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "capture-download-")));
  const id = "capture-request";
  const path = join(root, "Avenire", id, "notes.pdf");
  try {
    await mkdir(join(root, "Avenire", id), { recursive: true });
    await writeFile(path, "%PDF-hello");
    const info = await stat(path);
    const window = { captureId: id, startedAt: info.mtimeMs - 1000, endedAt: info.mtimeMs + 1000 };
    const download = {
      path,
      captureId: id,
      sizeBytes: info.size,
      mimeType: "application/pdf",
      url: "https://school.test/file",
    };
    expect(await validateBrowserDownload(download, root, window)).toBe(path);
    await expect(
      validateBrowserDownload({ ...download, path: join(root, "other.pdf") }, root, window),
    ).rejects.toThrow(/outside/);
    await expect(
      validateBrowserDownload({ ...download, path: path.replace(".pdf", ".exe") }, root, window),
    ).rejects.toThrow(/invalid/);
    await expect(
      validateBrowserDownload({ ...download, path: path.replace(".pdf", ".lnk") }, root, window),
    ).rejects.toThrow(/invalid/);
    await expect(
      validateBrowserDownload({ ...download, sizeBytes: info.size + 1 }, root, window),
    ).rejects.toThrow(/size mismatch/);
    await expect(
      validateBrowserDownload({ ...download, captureId: "other" }, root, window),
    ).rejects.toThrow(/invalid/);
    await expect(
      validateBrowserDownload(download, root, { ...window, startedAt: info.mtimeMs + 1 }),
    ).rejects.toThrow(/outside capture window/);
    await utimes(path, new Date(), new Date(info.mtimeMs + 5000));
    await expect(validateBrowserDownload(download, root, window)).rejects.toThrow(
      /outside capture window/,
    );
    await rm(path);
    const outside = join(root, "secret.pdf");
    await writeFile(outside, "%PDF-hello");
    await symlink(outside, path);
    await expect(validateBrowserDownload(download, root, window)).rejects.toThrow(
      /symlink escapes/,
    );
    await rm(join(root, "Avenire", id), { recursive: true });
    await mkdir(join(root, "elsewhere"));
    await symlink(join(root, "elsewhere"), join(root, "Avenire", id));
    await writeFile(join(root, "elsewhere", "notes.pdf"), "%PDF-hello");
    await expect(validateBrowserDownload(download, root, window)).rejects.toThrow(
      /symlink escapes/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("rejects HTML saved with a PDF filename and MIME with an honest host-specific reason", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "capture-download-html-")));
  const id = "capture-request";
  const path = join(root, "Avenire", id, "notes.pdf");
  try {
    await mkdir(join(root, "Avenire", id), { recursive: true });
    await writeFile(path, "<!doctype html><html><body>Please sign in</body></html>");
    const info = await stat(path);
    await expect(
      validateBrowserDownload(
        {
          path,
          captureId: id,
          sizeBytes: info.size,
          mimeType: "application/pdf",
          url: "https://school.test/notes.pdf",
        },
        root,
        { captureId: id, startedAt: info.mtimeMs - 1000, endedAt: info.mtimeMs + 1000 },
      ),
    ).rejects.toThrow(
      "The site returned a web page instead of the file (you may need to sign in on school.test)",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("accepts sub-millisecond file timestamps in the final wall-clock millisecond only", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "capture-download-clock-")));
  const captureId = "fractional-timestamp";
  const path = join(root, "Avenire", captureId, "notes.pdf");
  try {
    await mkdir(join(root, "Avenire", captureId), { recursive: true });
    await writeFile(path, "%PDF-hello");
    const seconds = Math.floor(Date.now() / 1000);
    await utimes(path, seconds, seconds + 0.0005);
    const info = await stat(path);
    const end = Math.floor(info.mtimeMs);
    const download = {
      path,
      captureId,
      sizeBytes: info.size,
      mimeType: "application/pdf",
      url: "https://school.test/file",
    };
    const window = { captureId, startedAt: end - 1000, endedAt: end };
    expect(await validateBrowserDownload(download, root, window)).toBe(path);
    await expect(
      validateBrowserDownload(download, root, { ...window, endedAt: end - 1 }),
    ).rejects.toThrow(/outside capture window/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
