"use client";

import { createContext, useContext } from "react";
import { useQuery } from "~/lib/rpc";

function useSettingsQuery() {
  return useQuery((client) => client["settings.get"](), "settings");
}

const SettingsContext = createContext<ReturnType<typeof useSettingsQuery> | undefined>(undefined);

/** Preload once per authenticated app session and retain data across routes and menu opens. */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettingsQuery();
  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error("useSettings must be used inside <SettingsProvider>.");
  return settings;
}
