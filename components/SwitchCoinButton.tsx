"use client";

import { useState } from "react";
import { ArrowRightLeft, CheckCircle2, Loader2 } from "lucide-react";
import { useNotifications } from "@/components/providers/notifications-provider";
import { useDemoMode } from "@/components/providers/demo-provider";

type SwitchCoinButtonProps = {
  fromCoin: string;
  toCoin: string;
  profitDiff: number;
  confidence: number;
};

export default function SwitchCoinButton({
  fromCoin,
  toCoin,
  profitDiff,
  confidence,
}: SwitchCoinButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const { addNotification } = useNotifications();
  const { isDemo } = useDemoMode();

  const handleSwitch = async () => {
    if (status !== "idle") return;
    setStatus("loading");

    // محاكاة التبديل (في الواقع سيرسل لـ HiveOS)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setStatus("success");

    addNotification({
      type: "success",
      title: "✅ تم التبديل بنجاح!",
      message: isDemo
        ? `[Demo] تم التبديل من ${fromCoin} إلى ${toCoin}. ربح إضافي متوقع: +${profitDiff.toFixed(1)}%`
        : `الجهاز الآن يعدّن ${toCoin}. سيتم التحقق خلال 30 ثانية.`,
      coin: toCoin,
    });

    setTimeout(() => setStatus("idle"), 3000);
  };

  if (fromCoin === toCoin) return null;

  return (
    <div className="bg-gradient-to-br from-purple-900/40 via-pink-900/30 to-purple-900/40 border border-purple-500/40 rounded-2xl p-5 mb-6 animate-glow">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
              🚀 توصية ذكية
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
              ثقة: {confidence}%
            </span>
          </div>
          <h3 className="text-lg font-bold text-white">
            بدّل من <span className="text-yellow-400">{fromCoin}</span> إلى{" "}
            <span className="text-green-400">{toCoin}</span>
          </h3>
          <p className="text-sm text-slate-300 mt-1">
            ربح إضافي متوقع: <span className="text-green-400 font-bold">+{profitDiff.toFixed(1)}%</span>
          </p>
        </div>
      </div>

      <button
        onClick={handleSwitch}
        disabled={status !== "idle"}
        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-white transition-all shadow-lg ${
          status === "success"
            ? "bg-green-500 shadow-green-500/30"
            : status === "loading"
            ? "bg-purple-700 cursor-wait"
            : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-purple-500/30 hover:shadow-purple-500/50"
        }`}
      >
        {status === "idle" && (
          <>
            <ArrowRightLeft className="w-5 h-5" />
            <span>نفّذ التبديل الآن</span>
          </>
        )}
        {status === "loading" && (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>جاري التبديل...</span>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-5 h-5" />
            <span>تم التبديل بنجاح!</span>
          </>
        )}
      </button>

      <p className="text-xs text-slate-400 mt-3 text-center">
        {isDemo
          ? "🟡 وضع تجريبي - لن يتم تنفيذ تبديل حقيقي"
          : "🟢 سيتم إرسال أمر التبديل لـ HiveOS"}
      </p>
    </div>
  );
}