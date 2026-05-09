"use client"

import StatCard from "@/components/cards/StatCard"
import { useSimulatedRig } from "@/lib/hooks/useSimulatedRig"

/**
 * 🎮 يعرض بيانات الجهاز الحية المتغيرة (Demo Mode)
 * إذا في Live Mode، يعرض البيانات الافتراضية الثابتة
 */
export default function LiveRigStats() {
  const sim = useSimulatedRig(5000) // تحديث كل 5 ثواني

  // إذا ما في بيانات محاكاة (Live Mode)، نعرض القيم الافتراضية
  const data = sim ?? {
    status: "online" as const,
    temperature: 61,
    hashrate: 60,
    power: 125,
    dailyProfitUSD: 0.55,
    solarOutput: 980,
    solarMax: 1400,
    isHotZone: false,
  }

  // 🎨 تحديد لون الحرارة حسب القيمة
  const tempStatus: "good" | "warning" | "danger" =
    data.temperature >= 75 ? "danger" : data.temperature >= 70 ? "warning" : "good"

  const tempSubValue =
    data.temperature >= 75
      ? "حرارة عالية!"
      : data.temperature >= 70
      ? "ابدأ المراقبة"
      : "في النطاق الآمن"

  // 🌞 حالة الطاقة الشمسية
  const solarPercent = (data.solarOutput / data.solarMax) * 100
  const solarStatus: "good" | "warning" | "neutral" =
    solarPercent >= 60 ? "good" : solarPercent >= 20 ? "warning" : "neutral"

  const solarBadge =
    solarPercent >= 70 ? "ذروة" : solarPercent > 0 ? "متوسط" : "ليل"

  // 💰 الربح بالدرهم
  const profitMAD = (data.dailyProfitUSD * 10.2).toFixed(1)

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard
        label="حالة الجهاز"
        value={data.status === "online" ? "شغال" : "متوقف"}
        iconName="check"
        status={data.status === "online" ? "good" : "danger"}
        badgeText={data.status === "online" ? "Online" : "Offline"}
      />
      <StatCard
        label="حرارة RTX 3070"
        value={`${data.temperature.toFixed(1)}°C`}
        subValue={tempSubValue}
        iconName="thermometer"
        status={tempStatus}
      />
      <StatCard
        label="الهاش ريت"
        value={`${data.hashrate.toFixed(1)} MH/s`}
        subValue="Ethash"
        iconName="zap"
        status="neutral"
      />
      <StatCard
        label="استهلاك الطاقة"
        value={`${Math.round(data.power)}W`}
        subValue="بعد Undervolt"
        iconName="plug"
        status="neutral"
      />
      <StatCard
        label="الربح اليومي"
        value={`$${data.dailyProfitUSD.toFixed(2)}`}
        subValue={`≈ ${profitMAD} MAD`}
        iconName="dollar"
        status="good"
      />
      <StatCard
        label="الطاقة الشمسية"
        value={`${Math.round(data.solarOutput)}W`}
        subValue={`من ${data.solarMax}W ممكنة`}
        iconName="sun"
        status={solarStatus}
        badgeText={solarBadge}
      />
    </section>
  )
}