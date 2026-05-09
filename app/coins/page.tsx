import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { CURRENT_MINING_COIN, MOCK_COINS } from "@/lib/constants/coins";
import { rankCoins } from "@/lib/engine/scoring";
import { assessRisk } from "@/lib/engine/risk";
import type { CoinData } from "@/lib/engine/types";

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

export default async function CoinsPage() {
  const { coins, source, timestamp } = await getCoins();
  const scores = rankCoins(coins);
  const lastUpdate = new Date(timestamp).toLocaleTimeString("ar-MA", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">مركز الأرباح</h1>
          <p className="text-sm text-slate-400 mt-1">
            تحليل ذكي لـ {coins.length} عملات • آخر تحديث: {lastUpdate}
          </p>
        </div>
        <Badge variant={source === "coingecko" ? "default" : "secondary"} className="text-xs">
          {source === "coingecko" ? "🟢 بيانات حية من CoinGecko" : "🟡 بيانات تجريبية"}
        </Badge>
      </div>

      <div className="grid gap-4">
        {scores.map((score, idx) => {
          const coin = coins.find((c) => c.symbol === score.symbol);
          if (!coin) return null;
          const risk = assessRisk(coin);
          const isCurrent = coin.symbol === CURRENT_MINING_COIN;
          const TrendIcon = coin.priceChange24h > 0 ? TrendingUp : coin.priceChange24h < 0 ? TrendingDown : Minus;
          const trendColor = coin.priceChange24h > 0 ? "text-green-400" : coin.priceChange24h < 0 ? "text-red-400" : "text-slate-400";
          const riskBadge = risk.level === "low" ? "default" : risk.level === "medium" ? "secondary" : "destructive";
          const riskLabel = risk.level === "low" ? "منخفضة" : risk.level === "medium" ? "متوسطة" : "عالية";

          return (
            <Card key={coin.symbol} className={`bg-slate-900/60 ${isCurrent ? "border-green-500/40" : "border-slate-800"}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-lg font-bold text-green-400">
                      #{idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-white">{coin.symbol}</h3>
                        {isCurrent && <Badge variant="default" className="text-xs">الحالية</Badge>}
                      </div>
                      <p className="text-xs text-slate-400">{coin.name} • {coin.algorithm}</p>
                    </div>
                  </div>

                  <div className="text-left">
                    <p className="text-2xl font-bold text-green-400">
                      {score.totalScore}<span className="text-sm text-slate-500">/100</span>
                    </p>
                    <Badge variant={riskBadge} className="text-xs mt-1">مخاطرة: {riskLabel}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <p className="text-xs text-slate-500 mb-1">الربح/يوم</p>
                    <p className="text-base font-bold text-white">${coin.dailyProfitUSD}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <p className="text-xs text-slate-500 mb-1">السعر</p>
                    <p className="text-base font-bold text-white">${coin.pricePerCoin < 0.01 ? coin.pricePerCoin.toFixed(6) : coin.pricePerCoin.toFixed(coin.pricePerCoin < 1 ? 4 : 2)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <p className="text-xs text-slate-500 mb-1">24h</p>
                    <p className={`text-base font-bold flex items-center gap-1 ${trendColor}`}>
                      <TrendIcon className="w-4 h-4" />
                      {coin.priceChange24h > 0 ? "+" : ""}{coin.priceChange24h}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <p className="text-xs text-slate-500 mb-1">7d</p>
                    <p className={`text-base font-bold ${coin.priceChange7d > 0 ? "text-green-400" : "text-red-400"}`}>
                      {coin.priceChange7d > 0 ? "+" : ""}{coin.priceChange7d}%
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-slate-400 mb-2">تفصيل النقاط:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">ربحية</span>
                        <span className="text-slate-400">{score.breakdown.profitability}/35</span>
                      </div>
                      <Progress value={(score.breakdown.profitability / 35) * 100} className="h-1.5" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">زخم</span>
                        <span className="text-slate-400">{score.breakdown.momentum}/20</span>
                      </div>
                      <Progress value={(score.breakdown.momentum / 20) * 100} className="h-1.5" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">سيولة</span>
                        <span className="text-slate-400">{score.breakdown.volume}/15</span>
                      </div>
                      <Progress value={(score.breakdown.volume / 15) * 100} className="h-1.5" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">استقرار</span>
                        <span className="text-slate-400">{score.breakdown.volatility}/10</span>
                      </div>
                      <Progress value={(score.breakdown.volatility / 10) * 100} className="h-1.5" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}