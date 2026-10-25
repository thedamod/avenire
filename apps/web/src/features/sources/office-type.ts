import type { SupportedFileType } from "officeparser/slim";
export function officeType(title: string, mime: string | null): SupportedFileType | null {
  const ext = title.toLowerCase().split(".").pop();
  if (ext && ["docx", "xlsx", "csv", "pptx", "odt", "ods", "odp", "rtf"].includes(ext))
    return ext as SupportedFileType;
  if (mime?.includes("wordprocessingml")) return "docx";
  if (mime?.includes("spreadsheetml")) return "xlsx";
  if (mime?.includes("presentationml")) return "pptx";
  if (mime?.startsWith("text/csv")) return "csv";
  return null;
}
