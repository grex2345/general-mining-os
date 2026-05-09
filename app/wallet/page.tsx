"use client";

import StatCard from "@/components/cards/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, TrendingUp, AlertCircle } from "lucide-react";
import { USD_TO_MAD } from "@/lib/constants/config";
import { useSimulatedWallet } from "@/lib/hooks/useSimulatedMarket";

// 📊 البيانات الافتراضية (للـ Live Mode)
const DEFAULT_HOLDINGS = [
  { symbol: "ERGO", amount: 12.5, pricePerCoin: 1.45, change24h: 4.5 },
  { symbol: "KAS", amount: 580, pricePerCoin: 0.085, change24h: -1.2 },
  { symbol: "USDT", amount: 45, pricePerCoin: 1, change24h: 0 },
];

const SELL_HISTORY = [
  { date: "2026-04-28", coin: "KAS", amount: 200, priceUSD: 17, method: "Binance P2P" },
  { date: "2026-04-15", coin: "ERGO", amount: 8, priceUSD: 11.2, method: "Binance P2P" },
];

export default function WalletPage() {
  // 🎮 محاكاة المحفظة (تتحدث كل 7 ثواني في Demo Mode)
  const sim = useSimulatedWallet(7000);

  // 🔄 إذا في Demo Mode → استخدم البيانات الحية
  // 🔵 إذا في Live Mode → استخدم البيانات الافتراضية
  const holdings = sim
    ? sim.coins.map((c) => ({
        symbol: c.symbol,
        amount: c.amount,
        pricePerCoin: c.priceUSD,
        change24h: c.change24h,
      }))
    : DEFAULT_HOLDINGS;

  const totalUSD = sim
    ? sim.totalUSD
    : holdings.reduce((sum, h) => sum + h.amount * h.pricePerCoin, 0);
  const totalMAD = totalUSD * USD_TO_MAD;
  const totalSold = SELL_HISTORY.reduce((sum, s) => sum + s.priceUSD, 0);

  // 💡 رسالة مساعد البيع الذكية
  const ergo = holdings.find((h) => h.symbol === "ERGO");
  const kas = holdings.find((h) => h.symbol === "KAS");
  const sellAdvice =
    ergo && ergo.change24h > 3
      ? `ERGO صاعدة +${ergo.change24h.toFixed(1)}% فآخر 24h. ممكن تكون فرصة بيع جزئي إذا كنت بغيت تسيّل.`
      : kas && kas.change24h < -2
      ? `KAS متراجعة ${kas.change24h.toFixed(1)}%. استنى تفيق قبل البيع.`
      : "السوق هادئ. راقب الفرص واصبر.";

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">المحفظة 👛</h1>
        <p className="text-sm text-slate-400 mt-1">
          أرصدتك الحالية + مساعد البيع
          {sim && <span className="text-green-400 mr-2">• 🟢 بيانات حية</span>}
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="القيمة الإجمالية" value={`$${totalUSD.toFixed(2)}`} subValue={`≈ ${totalMAD.toFixed(0)} MAD`} iconName="dollar" status="good" />
        <StatCard label="عدد العملات" value={holdings.length.toString()} subValue="فالمحفظة" iconName="coins" status="neutral" />
        <StatCard label="إجمالي المبيعات" value={`$${totalSold.toFixed(0)}`} subValue={`${SELL_HISTORY.length} عمليات`} iconName="check" status="good" />
        <StatCard label="USDT/MAD" value={`${USD_TO_MAD}`} subValue="السعر الحالي" iconName="dollar" status="neutral" />
      </section>

      <h2 className="text-xl font-bold text-white mb-4">💰 الأرصدة</h2>
      <div className="grid gap-4 mb-6">
        {holdings.map((h) => {
          const valueUSD = h.amount * h.pricePerCoin;
          const valueMAD = valueUSD * USD_TO_MAD;
          const isStable = h.symbol === "USDT";
          return (
            <Card key={h.symbol} className="bg-slate-900/60 border-slate-800">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-base font-bold text-green-400">
                      {h.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{h.symbol}</h3>
                      <p className="text-xs text-slate-400">{h.amount} {h.symbol}</p>
                    </div>
                  </div>

                  <div className="text-left">
                    <p className="text-lg font-bold text-white">${valueUSD.toFixed(2)}</p>
                    <p className="text-xs text-slate-400">{valueMAD.toFixed(0)} MAD</p>
                    {!isStable && (
                      <Badge
                        variant={h.change24h > 0 ? "default" : h.change24h < 0 ? "destructive" : "outline"}
                        className="text-xs mt-1"
                      >
                        {h.change24h > 0 ? "+" : ""}{h.change24h.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-blue-500/5 border-blue-500/30 mb-6">
        <CardContent className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">💡 مساعد البيع</h3>
              <p className="text-sm text-slate-300">{sellAdvice}</p>
            </div>
          </div>

          <a
            href="https://p2p.binance.com/ar/trade/all-payments/USDT?fiat=MAD"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-all text-sm font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            افتح Binance P2P (MAD)
          </a>
        </CardContent>
      </Card>

      <h2 className="text-xl font-bold text-white mb-4">📜 سجل المبيعات</h2>
      <div className="grid gap-3">
        {SELL_HISTORY.map((s, i) => (
          <Card key={i} className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                    {s.coin}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{s.amount} {s.coin}</p>
                    <p className="text-xs text-slate-500">{s.date} • {s.method}</p>
                  </div>
                </div>
                <p className="text-base font-bold text-green-400">${s.priceUSD}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-yellow-500/5 border-yellow-500/30 mt-6">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-300">
              ⚠️ البيع والتحويل يتم يدوياً عبر القنوات القانونية (Binance P2P).
              التطبيق يقدم توصيات فقط، ولا ينفذ أي عملية تلقائياً.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}