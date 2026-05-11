"use client";

import StatCard from "@/components/cards/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  TrendingUp,
  AlertCircle,
  Wallet,
  Pickaxe,
  ArrowUpRight,
  DollarSign,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { USD_TO_MAD } from "@/lib/constants/config";
import { useSimulatedWallet } from "@/lib/hooks/useSimulatedMarket";
import { useSettings } from "@/components/providers/settings-provider";
import { useNotifications } from "@/components/providers/notifications-provider";

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
  const sim = useSimulatedWallet(7000);
  const { settings } = useSettings();
  const { addNotification } = useNotifications();

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

  // 🪙 Pool Balance (محاكاة)
  const poolBalance = {
    confirmed: 0.0234,
    pending: 0.0087,
    coin: settings.currentCoin || "ERGO",
    nextPayout: "2 أيام",
    minPayout: 0.5,
  };
  const poolBalanceUSD = poolBalance.confirmed * 1.45;

  const ergo = holdings.find((h) => h.symbol === "ERGO");
  const kas = holdings.find((h) => h.symbol === "KAS");

  const sellAdvice =
    ergo && ergo.change24h > 3
      ? `🟢 ERGO صاعدة +${ergo.change24h.toFixed(1)}% فآخر 24h. ممكن تكون فرصة بيع جزئي.`
      : kas && kas.change24h < -2
      ? `🟡 KAS متراجعة ${kas.change24h.toFixed(1)}%. استنى تفيق قبل البيع.`
      : "⚪ السوق هادئ. راقب الفرص واصبر.";

  const handleSellClick = (coin: string, amount: number, value: number) => {
    addNotification({
      type: "info",
      title: `💰 جاري فتح Binance P2P`,
      message: `بيع ${amount.toFixed(2)} ${coin} (≈ $${value.toFixed(2)})`,
      coin,
    });
    window.open(
      `https://p2p.binance.com/ar/trade/all-payments/USDT?fiat=MAD`,
      "_blank"
    );
  };

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
            <Wallet className="w-6 h-6 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">المحفظة 👛</h1>
        </div>
        <p className="text-sm text-slate-400">
          أرصدتك الحالية + مساعد البيع
          {sim && <span className="text-green-400 mr-2">• 🟢 بيانات حية</span>}
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="القيمة الإجمالية"
          value={`$${totalUSD.toFixed(2)}`}
          subValue={`≈ ${totalMAD.toFixed(0)} MAD`}
          iconName="dollar"
          status="good"
        />
        <StatCard
          label="عدد العملات"
          value={holdings.length.toString()}
          subValue="في المحفظة"
          iconName="coins"
          status="neutral"
        />
        <StatCard
          label="إجمالي المبيعات"
          value={`$${totalSold.toFixed(0)}`}
          subValue={`${SELL_HISTORY.length} عمليات`}
          iconName="check"
          status="good"
        />
        <StatCard
          label="USDT/MAD"
          value={`${USD_TO_MAD}`}
          subValue="السعر الحالي"
          iconName="dollar"
          status="neutral"
        />
      </section>

      <Card className="bg-gradient-to-br from-blue-900/40 via-cyan-900/30 to-blue-900/40 border-2 border-blue-500/30 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                <Pickaxe className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">رصيد المسبح ⛏️</h3>
                <p className="text-xs text-slate-400">2miners.com - {poolBalance.coin}</p>
              </div>
            </div>
            <Badge variant="default" className="bg-blue-500/20 text-blue-300 border-blue-500/30">
              نشط
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-xs text-slate-400">مؤكد</span>
              </div>
              <div className="text-2xl font-bold text-green-400">
                {poolBalance.confirmed.toFixed(4)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                ≈ ${poolBalanceUSD.toFixed(2)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-slate-400">معلق</span>
              </div>
              <div className="text-2xl font-bold text-yellow-400">
                {poolBalance.pending.toFixed(4)}
              </div>
              <div className="text-xs text-slate-500 mt-1">في الانتظار</div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 p-3 rounded-lg bg-zinc-900/40 border border-zinc-800">
            <span>الحد الأدنى للسحب: {poolBalance.minPayout} {poolBalance.coin}</span>
            <span className="text-blue-400">الدفعة القادمة: {poolBalance.nextPayout}</span>
          </div>
        </CardContent>
      </Card>

      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-green-400" />
        الأرصدة
      </h2>
      <div className="grid gap-3 mb-6">
        {holdings.map((h) => {
          const valueUSD = h.amount * h.pricePerCoin;
          const valueMAD = valueUSD * USD_TO_MAD;
          const isStable = h.symbol === "USDT";

          return (
            <Card key={h.symbol} className="bg-slate-900/60 border-slate-800 hover:border-slate-700 transition-all">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 flex items-center justify-center text-base font-bold text-green-400">
                      {h.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{h.symbol}</h3>
                      <p className="text-xs text-slate-400">
                        {h.amount.toFixed(4)} {h.symbol}
                      </p>
                    </div>
                  </div>

                  <div className="text-left flex-shrink-0">
                    <p className="text-lg font-bold text-white">${valueUSD.toFixed(2)}</p>
                    <p className="text-xs text-slate-400">{valueMAD.toFixed(0)} MAD</p>
                    {!isStable && (
                      <Badge
                        variant={h.change24h > 0 ? "default" : h.change24h < 0 ? "destructive" : "outline"}
                        className="text-xs mt-1"
                      >
                        {h.change24h > 0 ? "+" : ""}
                        {h.change24h.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                </div>

                {!isStable && valueUSD > 1 && (
                  <button
                    onClick={() => handleSellClick(h.symbol, h.amount, valueUSD)}
                    className="w-full mt-3 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-yellow-500/20"
                  >
                    <DollarSign className="w-4 h-4" />
                    بيع على Binance P2P
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-gradient-to-br from-blue-900/40 to-cyan-900/30 border-2 border-blue-500/30 mb-6">
        <CardContent className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">💡 مساعد البيع الذكي</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{sellAdvice}</p>
            </div>
          </div>

          <a
            href="https://p2p.binance.com/ar/trade/all-payments/USDT?fiat=MAD"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white font-bold text-sm transition-all shadow-lg shadow-yellow-500/20"
          >
            <ExternalLink className="w-4 h-4" />
            افتح Binance P2P (MAD)
          </a>
        </CardContent>
      </Card>

      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5 text-purple-400" />
        سجل المبيعات
      </h2>
      <div className="grid gap-2 mb-6">
        {SELL_HISTORY.map((s, i) => (
          <Card key={i} className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-bold text-slate-400">
                    {s.coin}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {s.amount} {s.coin}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.date} • {s.method}
                    </p>
                  </div>
                </div>
                <p className="text-base font-bold text-green-400">${s.priceUSD}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-yellow-500/5 border-yellow-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-300 leading-relaxed">
              ⚠️ البيع والتحويل يتم يدوياً عبر Binance P2P. التطبيق يفتح لك الصفحة فقط، وأنت تنفذ البيع بنفسك بشكل آمن.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}