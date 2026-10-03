import { clipboard } from "electron";

export async function collectSelection(): Promise<{ readonly selectionText?: string }> {
  const text = (await clipboard.readText()).trim().slice(0, 20_000);
  return text ? { selectionText: text } : {};
}
