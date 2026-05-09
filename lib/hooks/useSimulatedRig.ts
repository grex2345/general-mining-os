"use client"

import { useEffect, useState } from "react"
import { useDemoMode } from "@/components/providers/demo-provider"

export type RigStats = {
  status: "online" | "offline"
  temperature: number      // °C
  hashrate: number         // MH/s
  power: number            // Watts
  dailyProfitUSD: number   // $
  solarOutput: number      // Watts
  solarMax: number         // Watts
  isHotZone: boolean       // إذا الحرارة عالية
}

// 🎲 دالة مساعدة: تولّد رقم عشوائي بين قيمتين
function randomBetween(min: number, max: number, decimals = 1): number {
  const value = Math.random() * (max - min) + min
  return Number(value.toFixed(decimals))
}

// 🎯 توليد بيانات واقعية لجهاز RTX 3070
function generateRigStats(previous?: RigStats): RigStats {
  // الحرارة تتذبذب ببطء (لا تقفز فجأة)
  const baseTemp = previous?.temperature ?? 62
  const tempDelta = randomBetween(-1.5, 1.5, 1)
  let temperature = baseTemp + tempDelta
  if (temperature < 55) temperature = 55
  if (temperature > 78) temperature = 78

  // الهاش ريت يتذبذب حول 60 MH/s
  const hashrate = randomBetween(58, 62, 1)

  // الاستهلاك يتذبذب حول 125W
  const power = randomBetween(118, 132, 0)

  // الربح اليومي يتذبذب حسب السوق
  const dailyProfitUSD = randomBetween(0.45, 0.85, 2)

  // الطاقة الشمسية حسب الوقت (نهار/ليل)
  const hour = new Date().getHours()
  let solarOutput = 0
  if (hour >= 7 && hour <= 18) {
    // النهار: من 200W إلى 1300W حسب الساعة
    const peakHour = 13 // ذروة الشمس
    const distance = Math.abs(hour - peakHour)
    const maxAtThisHour = 1300 - (distance * 150)
    solarOutput = randomBetween(maxAtThisHour - 100, maxAtThisHour, 0)
  }

  return {
    status: "online",
    temperature,
    hashrate,
    power,
    dailyProfitUSD,
    solarOutput,
    solarMax: 1400,
    isHotZone: temperature >= 72,
  }
}

/**
 * 🎮 Hook لمحاكاة جهاز تعدين شغال
 * - في Demo Mode: يولّد بيانات حية متغيرة كل 5 ثواني
 * - في Live Mode: يرجع null (تستخدم البيانات الحقيقية)
 */
export function useSimulatedRig(intervalMs: number = 5000): RigStats | null {
  const { isDemo, isReady } = useDemoMode()
  const [stats, setStats] = useState<RigStats | null>(null)

  useEffect(() => {
    // إذا لم يكن في Demo Mode، لا نفعل شيء
    if (!isReady || !isDemo) {
      setStats(null)
      return
    }

    // توليد أول بيانات فوراً
    setStats(generateRigStats())

    // ثم تحديث كل X ثواني
    const interval = setInterval(() => {
      setStats((prev) => generateRigStats(prev ?? undefined))
    }, intervalMs)

    return () => clearInterval(interval)
  }, [isDemo, isReady, intervalMs])

  return stats
}