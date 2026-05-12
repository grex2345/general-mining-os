"use client";

import { useState } from "react";
import { ArrowRightLeft, Check, Loader2, Coins, Sparkles } from "lucide-react";
import { useSettings } from "@/components/providers/settings-provider";
import { useNotifications } from "@/components/providers/notifications-provider";

const COIN_INFO: Record<string, { emoji: string; color: string; bg: string; border: string }> = {
  ERGO: { emoji: "🟠", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  KAS: { emoji: "🟢", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30" },
  ETC: { emoji: "🔵", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  RVN: { emoji: "🟣", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  FLUX: { emoji: "⚡", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  ALPH: { emoji: "🌟", color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/30" },
};

export default function QuickSwitchPanel() {
  const { settings, updateSettings } = useSettings();
  const { addNotification } = useNotifications();
  const [switching, setSwitching] = useState<string | null>(null);

  const currentCoin = settings.currentCoin || "ERGO";
  const enabledCoins = settings.enabledCoins || ["ERGO", "KAS", "ETC"];

  const handleSwitch = async (newCoin: string) => {
    if (newCoin === currentCoin || switching) return;

    setSwitching(newCoin);

    // صوت تبديل
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}

    // محاكاة وقت التبديل
    await new Promise((r) => setTimeout(r, 1500));

    // تحديث العملة
    updateSettings({ currentCoin: newCoin });

    // صوت نجاح
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}

    addNotification({
      type: "success",
      title: `🎉 تم التبديل إلى ${newCoin}!`,
      message: `الجهاز الآن يعدّن ${newCoin}. تم التحديث في كل مكان.`,
      coin: newCoin,
    });

    setSwitching(null);
  };

  const currentInfo = COIN_INFO[currentCoin] || COIN_INFO.ERGO;

  return (
    <div className="bg-gradient-to-br from-purple-900/40 via-pink-900/30 to-purple-900/40 border-2 border-purple-500/40 rounded-2xl p-5 mb-6 relative overflow-hidden">
      {/* خلفية متحركة */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-pink-500 rounded-full blur-3xl animate-pulse" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
              <ArrowRightLeft className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">تبديل سريع للعملة</h3>
              <p className="text-xs text-slate-400">اختر العملة وسيتم التبديل فوراً</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${currentInfo.bg} border ${currentInfo.border}`}>
            <Sparkles className={`w-3 h-3 ${currentInfo.color}`} />
            <span className="text-xs text-slate-400">الآن:</span>
            <span className="text-base">{currentInfo.emoji}</span>
            <span className={`text-sm font-bold ${currentInfo.color}`}>{currentCoin}</span>
          </div>
        </div>

        {/* Coin Buttons */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {enabledCoins.map((coin) => {
            const info = COIN_INFO[coin] || COIN_INFO.ERGO;
            const isCurrent = coin === currentCoin;
            const isSwitching = switching === coin;

            return (
              <button
                key={coin}
                onClick={() => handleSwitch(coin)}
                disabled={isCurrent || switching !== null}
                className={`relative p-3 rounded-xl border-2 transition-all ${
                  isCurrent
                    ? `${info.bg} ${info.border} ring-2 ring-purple-500/50`
                    : isSwitching
                    ? `${info.bg} ${info.border} animate-pulse`
                    : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-600 hover:scale-105 active:scale-95"
                } ${isCurrent ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="text-2xl mb-1">{info.emoji}</div>
                <div className={`text-xs font-bold ${isCurrent ? info.color : "text-white"}`}>
                  {coin}
                </div>
                {isCurrent && (
                  <div className="absolute top-1 left-1">
                    <Check className={`w-3 h-3 ${info.color}`} />
                  </div>
                )}
                {isSwitching && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                    <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {switching && (
          <div className="mt-3 text-center text-xs text-purple-300 animate-pulse">
            ⚡ جاري التبديل إلى {switching}...
          </div>
        )}
      </div>
    </div>
  );
}