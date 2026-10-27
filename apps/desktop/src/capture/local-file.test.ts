import { expect, it } from "vite-plus/test";
import { localBasename, localFilePath } from "./local-file.ts";

it("decodes the owner's exact Windows file URL with spaces using Windows fileURLToPath semantics", () => {
  const url = "file:///C:/Users/<user>/Downloads/MATH%20U113%20Course%20Handout.pdf";
  expect(localFilePath(url, "win32")).toBe(
    "C:\\Users\\<user>\\Downloads\\MATH U113 Course Handout.pdf",
  );
  expect(localBasename(localFilePath(url, "win32"))).toBe("MATH U113 Course Handout.pdf");
  expect(() => localFilePath("https://school.test/a.pdf", "win32")).toThrow();
  expect(localFilePath("file:///home/student/My%20Notes.pdf", "linux")).toBe(
    "/home/student/My Notes.pdf",
  );
});
