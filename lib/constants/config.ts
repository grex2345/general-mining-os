import type { SwitchProtection } from "@/lib/engine/types";

export const FEATURES = {
  miningMonitoring: true,
  solarMonitoring: true,
  coinAnalysis: true,
  recommendationEngine: true,
  alertsSystem: true,
  calculator: true,
  walletAdvisor: true,
  growthPlan: true,
  priceComparison: true,
  aiRentalComparison: true,

  aiRentalAutoSwitch: false,
  aiRentalExecution: false,
  dualMining: false,
  weatherAwareSolar: false,
  usedGpuRadar: false,
  newsMonitor: false,
  whaleSignals: false,
  fullAutoMode: false,
} as const;

export const SWITCH_PROTECTION: SwitchProtection = {
  minScoreDifference: 8,
  confirmationCycles: 2,
  cooldownHours: 4,
};

export const USD_TO_MAD = 10.2;