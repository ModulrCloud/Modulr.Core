"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { applyColorModeToDocument } from "@/lib/themeVars";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";

type AppUiContextValue = {
  settings: AppSettings;
  setSettings: (next: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
};

const AppUiContext = createContext<AppUiContextValue | null>(null);

export function useAppUi(): AppUiContextValue {
  const ctx = useContext(AppUiContext);
  if (!ctx) {
    throw new Error("useAppUi must be used within AppProviders");
  }
  return ctx;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setSettingsState(loadSettings());
  }, []);

  useEffect(() => {
    applyColorModeToDocument(settings.colorMode);
  }, [settings.colorMode]);

  const setSettings = useCallback(
    (updater: AppSettings | ((prev: AppSettings) => AppSettings)) => {
      setSettingsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveSettings(next);
        return next;
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      settingsOpen,
      setSettingsOpen,
    }),
    [settings, setSettings, settingsOpen],
  );

  return (
    <AppUiContext.Provider value={value}>{children}</AppUiContext.Provider>
  );
}
