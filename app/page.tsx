import StatCard from "@/components/cards/StatCard";
import DecisionCard from "@/components/cards/DecisionCard";
import OpportunityCard from "@/components/cards/OpportunityCard";
import SmartAlert from "@/components/SmartAlert";
import SwitchCoinButton from "@/components/SwitchCoinButton";
import { MOCK_COINS } from "@/lib/constants/coins";
import { makeDecision } from "@/lib/engine/decision";
import { detectOpportunities } from "@/lib/engine/opportunity";
import type { CoinData } from "@/lib/engine/types";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/db/client";
import LiveRigStats from "@/components/cards/LiveRigStats";
import CurrentCoinBadge from "@/components/CurrentCoinBadge";

// 🪙 جلب العملات من API
async function getCoins(): Promise<{ coins: CoinData[]; source: string; timestamp: string }> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/coins`, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return { coins: data.coins, source: data.source, timestamp: data.timestamp };
  } catch {
    return { coins: MOCK_COINS, source: "mock", timestamp: new Date().toISOString() };
  }
}

// 🎯 جلب العملة الحالية من الداتابيز
async function getCurrentCoin(): Promise<string> {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { id: 1 },
    });
    return settings?.currentMiningCoin || "KAS";
  } catch {
    return "KAS";
  }
}

// 💾 حفظ القرار في الداتابيز
async function saveDecision(decision: any, currentCoin: string) {
  try {
    const lastDecision = await prisma.decisionLog.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    if (lastDecision) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (
        lastDecision.timestamp > fiveMinutesAgo &&
        lastDecision.action === decision.action &&
        lastDecision.coin === currentCoin
      ) {
        return;
      }
    }

    const riskLevel = typeof decision.risk === 'object' 
      ? decision.risk.level 
      : (decision.risk || 'medium');

    const reasonText = typeof decision.reason === 'string'
      ? decision.reason
      : 'تحليل تلقائي من المحرك';

    await prisma.decisionLog.create({
      data: {
        coin: currentCoin,
        action: decision.action,
        score: decision.confidence,
        risk: riskLevel,
        reason: reasonText,
        fromCoin: decision.action === 'switch' ? currentCoin : null,
        toCoin: decision.action === 'switch' ? decision.recommendedCoin : null,
      },
    });
  } catch (error) {
    console.error('فشل حفظ القرار:', error);
  }
}

export default async function Home() {
  // 📊 جلب البيانات بالتوازي
  const [{ coins, source, timestamp }, currentCoin] = await Promise.all([
    getCoins(),
    getCurrentCoin(),
  ]);

  const decision = makeDecision(coins, currentCoin);
  const opportunities = detectOpportunities(coins);

  // 📊 إحصائيات
  const totalDecisions = await prisma.decisionLog.count();
  const switchCount = await prisma.decisionLog.count({
    where: { action: 'switch' }
  });
  const lastSwitch = await prisma.decisionLog.findFirst({
    where: { action: 'switch' },
    orderBy: { timestamp: 'desc' },
  });

  // 💾 حفظ القرار تلقائياً
  await saveDecision(decision, currentCoin);

  const lastUpdate = new Date(timestamp).toLocaleTimeString("ar-MA", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // 🚨 شروط التنبيه الذكي
  const shouldShowAlert = 
    decision.action === "switch" && 
    decision.recommendedCoin !== currentCoin &&
    decision.confidence >= 60;

  // استخراج نسبة الفرق من السبب
  const profitDiffMatch = decision.reason?.match(/(\d+\.?\d*)%/);
  const profitDiff = profitDiffMatch ? parseFloat(profitDiffMatch[1]) : 0;

  return (
    <>
      {/* 🚨 التنبيه الذكي */}
      <SmartAlert
        shouldShow={shouldShowAlert}
        fromCoin={currentCoin}
        toCoin={decision.recommendedCoin}
        profitDiff={profitDiff}
        reason={decision.reason || "فرصة محتملة"}
      />

      {/* 🔘 زر التبديل بضغطة واحدة */}
      {shouldShowAlert && (
        <SwitchCoinButton
          fromCoin={currentCoin}
          toCoin={decision.recommendedCoin}
          profitDiff={profitDiff}
          confidence={decision.confidence}
        />
      )}

      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">نظرة عامة على المزرعة</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-sm text-slate-400">آخر تحديث: {lastUpdate}</p>
            <span className="text-slate-500">•</span>
            <p className="text-sm text-slate-400">العملة الحالية:</p>
            <CurrentCoinBadge />
          </div>
        </div>
        <Badge variant={source === "coingecko" ? "default" : "secondary"} className="text-xs">
          {source === "coingecko" ? "🟢 بيانات حية" : "🟡 بيانات تجريبية"}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <div className="lg:col-span-2">
          <LiveRigStats />
        </div>

        <div>
          <DecisionCard decision={decision} />
        </div>
      </div>

      {opportunities.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-bold text-white">
              فرص ذكية ({opportunities.length})
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {opportunities.slice(0, 4).map((opp, i) => (
              <OpportunityCard key={i} opportunity={opp} />
            ))}
          </div>
        </div>
      )}

      {/* 📊 إحصائيات الذكاء */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">📊</span>
          <h2 className="text-lg font-bold text-white">إحصائيات الذكاء</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-purple-400 text-sm mb-1">🧠 إجمالي القرارات</div>
            <div className="text-3xl font-bold text-white">{totalDecisions}</div>
            <div className="text-xs text-zinc-500 mt-1">قرار محفوظ</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-green-400 text-sm mb-1">🔄 عمليات التبديل</div>
            <div className="text-3xl font-bold text-white">{switchCount}</div>
            <div className="text-xs text-zinc-500 mt-1">مرة بدّلت العملة</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-yellow-400 text-sm mb-1">⏰ آخر تبديل</div>
            <div className="text-xl font-bold text-white">
              {lastSwitch 
                ? new Date(lastSwitch.timestamp).toLocaleDateString('ar-MA') 
                : 'ما زال'}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {lastSwitch ? `${lastSwitch.fromCoin} → ${lastSwitch.toCoin}` : '—'}
            </div>
          </div>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="أفضل عملة الآن" value={decision.recommendedCoin} subValue={`Score: ${decision.confidence}/100`} iconName="coins" status="good" />
        <StatCard label="استرداد رأس المال" value="3%" subValue="من أصل 6,850 MAD" iconName="target" status="warning" badgeText="بداية" />
        <StatCard label="عدد العملات المحللة" value={decision.scores.length.toString()} subValue="عملات نشطة" iconName="coins" status="neutral" />
        <StatCard label="حالة المحرك" value={decision.action === "switch" ? "بدّل" : decision.action === "stay" ? "ابقَ" : "انتظر"} subValue={`ثقة: ${decision.confidence}%`} iconName="check" status={decision.action === "switch" ? "good" : decision.action === "wait" ? "warning" : "neutral"} />
      </section>
    </>
  );
}