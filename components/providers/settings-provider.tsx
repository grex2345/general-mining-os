"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type UserSettings = {
  // GPU info
  gpuType: string;
  gpuCount: number;

  // HiveOS
  hiveosToken: string;
  hiveosFarmId: string;
  hiveosConnected: boolean;

  // Financial
  budget: number; // الميزانية الحالية بالدولار
  capital: number; // رأس المال المستثمر
  electricityPrice: number; // $ per kWh

  // Mining
  currentCoin: string;
  enabledCoins: string[]; // العملات المختارة للتعدين

  // Targets
  monthlyGoal: number; // الهدف الشهري بالدولار
  totalEarned: number; // إجمالي ما ربحت
};

type SettingsContextType = {
  settings: UserSettings;
  isReady: boolean;
  updateSettings: (updates: Partial<UserSettings>) => void;
  resetSettings: () => void;
};

const STORAGE_KEY = "gmos-user-settings";

const defaultSettings: UserSettings = {
  gpuType: "RTX 3070",
  gpuCount: 1,
  hiveosToken: "",
  hiveosFarmId: "",
  hiveosConnected: false,
  budget: 0,
  capital: 0,
  electricityPrice: 0.12,
  currentCoin: "ERGO",
  enabledCoins: ["ERGO", "KAS", "ETC"],
  monthlyGoal: 50,
  totalEarned: 0,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings({ ...defaultSettings, ...parsed });
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
    setIsReady(true);
  }, []);

  const updateSettings = (updates: Partial<UserSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const value = useMemo(
    () => ({ settings, isReady, updateSettings, resetSettings }),
    [settings, isReady]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}