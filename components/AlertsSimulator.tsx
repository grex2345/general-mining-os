"use client";

import { useSimulatedAlerts } from "@/lib/hooks/useSimulatedAlerts";

/**
 * 🎮 مكون فارغ، فقط يشغّل الـ Hook
 * نضعه في layout.tsx ليبدأ توليد التنبيهات تلقائياً
 */
export function AlertsSimulator() {
  useSimulatedAlerts();
  return null;
}