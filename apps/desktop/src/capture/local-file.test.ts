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

it("compares path identities using the capture platform while preserving Linux case", async () => {
  const { localPathIdentity } = await import("./local-file.ts");
  expect(localPathIdentity("C:/Users/Student/../Student/A.pdf", "win32")).toBe(
    localPathIdentity("c:\\users\\student\\a.pdf", "win32"),
  );
  expect(localPathIdentity("/Users/U/A.pdf", "darwin")).toBe("/users/u/a.pdf");
  expect(localPathIdentity("/home/u/A.pdf", "linux")).not.toBe(
    localPathIdentity("/home/u/a.pdf", "linux"),
  );
});
