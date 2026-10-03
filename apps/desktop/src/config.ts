import { app } from "electron";

export const appUrl = process.env.AVENIRE_APP_URL ?? (app.isPackaged ? "https://app.avenire.space" : "http://localhost:3000");
export const defaultCaptureShortcut = "CommandOrControl+Shift+Space";
export const extensionReceiverPort = 47823;
