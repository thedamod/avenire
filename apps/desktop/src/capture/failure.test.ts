import { expect, it } from "vite-plus/test";
import { captureFailureReason } from "./failure.ts";
import { DeviceAcquisitionError, UploadRejected } from "./source-acquisition.ts";

const rejected = (status: number, detail?: string) =>
  new DeviceAcquisitionError({ operation: "upload", cause: new UploadRejected(status, detail) });

it("explains server rejections, including an older server that refuses new fields", () => {
  expect(captureFailureReason(rejected(400, "Unexpected key origin"))).toContain(
    "update and restart the Avenire server",
  );
  expect(captureFailureReason(rejected(400, "Unexpected key origin"))).toContain("origin");
  expect(captureFailureReason(rejected(401))).toContain("sign in");
  expect(captureFailureReason(rejected(413))).toContain("256 MB");
  expect(captureFailureReason(rejected(503))).toContain("HTTP 503");
});

it("reduces local errors to their kind without echoing paths", () => {
  const locked = Object.assign(
    new Error("EBUSY: resource busy, open 'C:\\\\Users\\\\x\\\\a.docx'"),
    {
      code: "EBUSY",
    },
  );
  const reason = captureFailureReason(
    new DeviceAcquisitionError({ operation: "acquire", cause: locked }),
  );
  expect(reason).toContain("locked");
  expect(reason).not.toContain("Users");
  expect(captureFailureReason(new TypeError("fetch failed"))).toContain("Couldn't reach Avenire");
});
