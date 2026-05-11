"use client";

import { useSettings } from "@/components/providers/settings-provider";
import { Coins } from "lucide-react";

const COIN_COLORS: Record<string, { bg: string; text: string; emoji: string }> = {
  ERGO: { bg: "from-orange-500/20 to-red-500/20", text: "text-orange-400", emoji: "🟠" },
  KAS: { bg: "from-green-500/20 to-emerald-500/20", text: "text-green-400", emoji: "🟢" },
  ETC: { bg: "from-blue-500/20 to-cyan-500/20", text: "text-blue-400", emoji: "🔵" },
  RVN: { bg: "from-purple-500/20 to-pink-500/20", text: "text-purple-400", emoji: "🟣" },
  FLUX: { bg: "from-yellow-500/20 to-orange-500/20", text: "text-yellow-400", emoji: "⚡" },
  ALPH: { bg: "from-pink-500/20 to-rose-500/20", text: "text-pink-400", emoji: "🌟" },
};

export default function CurrentCoinBadge() {
  const { settings } = useSettings();
  const coin = settings.currentCoin || "ERGO";
  const config = COIN_COLORS[coin] || COIN_COLORS.ERGO;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${config.bg} border border-white/10 animate-bounce-in`}
    >
      <span className="text-base">{config.emoji}</span>
      <span className={`text-sm font-bold ${config.text}`}>{coin}</span>
    </div>
  );
}