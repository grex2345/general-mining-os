"use client"

import { useEffect, useState } from "react"
import { useDemoMode } from "@/components/providers/demo-provider"

// ═══════════════════════════════════════════
// 📊 الأنواع (Types)
// ═══════════════════════════════════════════

export type WalletCoin = {
  symbol: string
  name: string
  amount: number
  priceUSD: number
  valueUSD: number
  valueMAD: number
  change24h: number
}

export type WalletData = {
  totalUSD: number
  totalMAD: number
  coinsCount: number
  totalSalesUSD: number
  usdtToMad: number
  coins: WalletCoin[]
  miningTimeMinutes: number  // كم دقيقة تم التعدين (وهمي)
}

export type SolarData = {
  currentOutput: number
  maxCapacity: number
  efficiency: number
  dailyEnergyKWh: number
  batteryLevel: number
  isCharging: boolean
  panelsActive: number
  totalPanels: number
  voltage: number
  amperage: number
}

export type WorkerData = {
  id: string
  name: string
  status: "online" | "offline" | "warning"
  temperature: number
  hashrate: number
  power: number
  uptime: string
  coin: string
  profitUSD: number
}

export type WorkersData = {
  totalWorkers: number
  onlineWorkers: number
  totalHashrate: number
  totalPower: number
  totalProfitUSD: number
  workers: WorkerData[]
}

// ═══════════════════════════════════════════
// 🎲 دوال مساعدة
// ═══════════════════════════════════════════

function randomBetween(min: number, max: number, decimals = 2): number {
  const value = Math.random() * (max - min) + min
  return Number(value.toFixed(decimals))
}

function smoothChange(prev: number, min: number, max: number, maxDelta: number): number {
  const delta = randomBetween(-maxDelta, maxDelta)
  let value = prev + delta
  if (value < min) value = min
  if (value > max) value = max
  return value
}

// ═══════════════════════════════════════════
// 💼 محاكاة المحفظة (واقعية - تبدأ من الصفر)
// ═══════════════════════════════════════════

const WALLET_STORAGE_KEY = "gmos-demo-wallet"

type StoredWallet = {
  ergoAmount: number
  kasAmount: number
  usdtAmount: number
  startedAt: number  // timestamp
}

function loadWallet(): StoredWallet {
  if (typeof window === "undefined") {
    return { ergoAmount: 0, kasAmount: 0, usdtAmount: 0, startedAt: Date.now() }
  }
  try {
    const saved = localStorage.getItem(WALLET_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  const fresh: StoredWallet = { ergoAmount: 0, kasAmount: 0, usdtAmount: 0, startedAt: Date.now() }
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(fresh))
  return fresh
}

function saveWallet(wallet: StoredWallet) {
  if (typeof window === "undefined") return
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet))
}

function generateWalletData(prev?: WalletData): WalletData {
  const stored = loadWallet()

  // 💰 كل 7 ثواني: نضيف ربح صغير جداً (واقعي للـ RTX 3070)
  // الربح الحقيقي: ~$0.65/يوم = ~$0.000045/ثانية
  // كل 7 ثواني = ~$0.0003 من ERGO
  const ergoEarnedPerInterval = 0.0002  // ERGO تكسب
  const kasEarnedPerInterval = 0.05     // KAS تكسب (أصغر قيمة)

  stored.ergoAmount += ergoEarnedPerInterval
  stored.kasAmount += kasEarnedPerInterval
  saveWallet(stored)

  // 💱 الأسعار (تتذبذب طبيعياً)
  const ergoPrice = prev ? smoothChange(prev.coins[0]?.priceUSD ?? 1.45, 1.20, 1.80, 0.05) : 1.45
  const kasPrice = prev ? smoothChange(prev.coins[1]?.priceUSD ?? 0.085, 0.075, 0.095, 0.003) : 0.085
  const usdtPrice = 1.0

  const coins: WalletCoin[] = [
    {
      symbol: "ERGO",
      name: "Ergo",
      amount: Number(stored.ergoAmount.toFixed(4)),
      priceUSD: ergoPrice,
      valueUSD: stored.ergoAmount * ergoPrice,
      valueMAD: stored.ergoAmount * ergoPrice * 10.2,
      change24h: randomBetween(-3, 6, 1),
    },
    {
      symbol: "KAS",
      name: "Kaspa",
      amount: Number(stored.kasAmount.toFixed(2)),
      priceUSD: kasPrice,
      valueUSD: stored.kasAmount * kasPrice,
      valueMAD: stored.kasAmount * kasPrice * 10.2,
      change24h: randomBetween(-4, 4, 1),
    },
    {
      symbol: "USDT",
      name: "Tether",
      amount: stored.usdtAmount,
      priceUSD: usdtPrice,
      valueUSD: stored.usdtAmount * usdtPrice,
      valueMAD: stored.usdtAmount * usdtPrice * 10.2,
      change24h: 0,
    },
  ]

  const totalUSD = coins.reduce((sum, c) => sum + c.valueUSD, 0)
  const miningTimeMinutes = Math.floor((Date.now() - stored.startedAt) / 60000)

  return {
    totalUSD,
    totalMAD: totalUSD * 10.2,
    coinsCount: coins.filter((c) => c.amount > 0).length,
    totalSalesUSD: 0,
    usdtToMad: 10.2,
    coins,
    miningTimeMinutes,
  }
}

// ═══════════════════════════════════════════
// ☀️ محاكاة الطاقة الشمسية
// ═══════════════════════════════════════════

function generateSolarData(prev?: SolarData): SolarData {
  const hour = new Date().getHours()
  const isNight = hour < 7 || hour > 18

  let baseOutput = 0
  if (!isNight) {
    const peakHour = 13
    const distance = Math.abs(hour - peakHour)
    baseOutput = Math.max(0, 1300 - distance * 130)
  }

  const currentOutput = isNight
    ? 0
    : prev
    ? smoothChange(prev.currentOutput, baseOutput - 100, baseOutput + 50, 30)
    : baseOutput

  const maxCapacity = 1400
  const efficiency = (currentOutput / maxCapacity) * 100

  const batteryDelta = isNight ? -0.5 : currentOutput > 600 ? 0.8 : 0
  const batteryLevel = prev
    ? Math.max(20, Math.min(100, prev.batteryLevel + batteryDelta))
    : isNight
    ? 60
    : 75

  return {
    currentOutput: Math.round(currentOutput),
    maxCapacity,
    efficiency: Number(efficiency.toFixed(1)),
    dailyEnergyKWh: prev ? prev.dailyEnergyKWh + currentOutput / 60000 : randomBetween(2.5, 4.5, 2),
    batteryLevel: Number(batteryLevel.toFixed(1)),
    isCharging: !isNight && currentOutput > 100,
    panelsActive: isNight ? 0 : 5,
    totalPanels: 5,
    voltage: isNight ? 0 : Number(randomBetween(36, 48, 1)),
    amperage: isNight ? 0 : Number(randomBetween(5, 12, 1)),
  }
}

// ═══════════════════════════════════════════
// 🖥️ محاكاة الأجهزة
// ═══════════════════════════════════════════

function generateWorkersData(prev?: WorkersData): WorkersData {
  const workers: WorkerData[] = [
    {
      id: "worker-1",
      name: "Rig-Main-01",
      status: "online",
      temperature: prev?.workers[0]
        ? smoothChange(prev.workers[0].temperature, 58, 78, 1.5)
        : 65,
      hashrate: randomBetween(58, 62, 1),
      power: Math.round(randomBetween(118, 132, 0)),
      uptime: "12h 34m",
      coin: "ERGO",
      profitUSD: randomBetween(0.45, 0.85, 2),
    },
  ]

  const totalHashrate = workers.reduce((sum, w) => sum + w.hashrate, 0)
  const totalPower = workers.reduce((sum, w) => sum + w.power, 0)
  const totalProfitUSD = workers.reduce((sum, w) => sum + w.profitUSD, 0)
  const onlineWorkers = workers.filter((w) => w.status === "online").length

  return {
    totalWorkers: workers.length,
    onlineWorkers,
    totalHashrate: Number(totalHashrate.toFixed(1)),
    totalPower,
    totalProfitUSD: Number(totalProfitUSD.toFixed(2)),
    workers,
  }
}

// ═══════════════════════════════════════════
// 🎮 الـ Hooks
// ═══════════════════════════════════════════

export function useSimulatedWallet(intervalMs: number = 7000): WalletData | null {
  const { isDemo, isReady } = useDemoMode()
  const [data, setData] = useState<WalletData | null>(null)

  useEffect(() => {
    if (!isReady || !isDemo) {
      setData(null)
      return
    }

    setData(generateWalletData())

    const interval = setInterval(() => {
      setData((prev) => generateWalletData(prev ?? undefined))
    }, intervalMs)

    return () => clearInterval(interval)
  }, [isDemo, isReady, intervalMs])

  return data
}

export function useSimulatedSolar(intervalMs: number = 6000): SolarData | null {
  const { isDemo, isReady } = useDemoMode()
  const [data, setData] = useState<SolarData | null>(null)

  useEffect(() => {
    if (!isReady || !isDemo) {
      setData(null)
      return
    }

    setData(generateSolarData())

    const interval = setInterval(() => {
      setData((prev) => generateSolarData(prev ?? undefined))
    }, intervalMs)

    return () => clearInterval(interval)
  }, [isDemo, isReady, intervalMs])

  return data
}

export function useSimulatedWorkers(intervalMs: number = 5000): WorkersData | null {
  const { isDemo, isReady } = useDemoMode()
  const [data, setData] = useState<WorkersData | null>(null)

  useEffect(() => {
    if (!isReady || !isDemo) {
      setData(null)
      return
    }

    setData(generateWorkersData())

    const interval = setInterval(() => {
      setData((prev) => generateWorkersData(prev ?? undefined))
    }, intervalMs)

    return () => clearInterval(interval)
  }, [isDemo, isReady, intervalMs])

  return data
}

// 🔄 دالة لإعادة تصفير المحفظة (للاستخدام لاحقاً في الإعدادات)
export function resetDemoWallet() {
  if (typeof window === "undefined") return
  const fresh: StoredWallet = { ergoAmount: 0, kasAmount: 0, usdtAmount: 0, startedAt: Date.now() }
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(fresh))
}