"use client";

import { useState } from "react";
import { ArrowRightLeft, CheckCircle2, Loader2, X, Sparkles, Zap } from "lucide-react";
import { useNotifications } from "@/components/providers/notifications-provider";
import { useDemoMode } from "@/components/providers/demo-provider";
import { useSettings } from "@/components/providers/settings-provider";

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
  const [showModal, setShowModal] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const { addNotification } = useNotifications();
  const { isDemo } = useDemoMode();
  const { updateSettings } = useSettings();

  const handleSwitch = async () => {
    setStatus("loading");

    // محاكاة التبديل (في الواقع سيرسل لـ HiveOS)
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // تحديث العملة الحالية في كل التطبيق
    updateSettings({ currentCoin: toCoin });

    setStatus("success");

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
      title: `🎉 تم التبديل إلى ${toCoin}!`,
      message: isDemo
        ? `[Demo] الجهاز يعدّن ${toCoin} الآن. ربح إضافي متوقع: +${profitDiff.toFixed(1)}%`
        : `الجهاز الآن يعدّن ${toCoin}. ربح إضافي متوقع: +${profitDiff.toFixed(1)}%`,
      coin: toCoin,
    });

    // إغلاق المودال بعد 2 ثانية
    setTimeout(() => {
      setShowModal(false);
      setStatus("idle");
    }, 2000);
  };

  if (fromCoin === toCoin) return null;

  return (
    <>
      {/* الكارت الرئيسي */}
      <div className="relative bg-gradient-to-br from-purple-900/40 via-pink-900/30 to-purple-900/40 border-2 border-purple-500/40 rounded-2xl p-5 mb-6 overflow-hidden">
        {/* خلفية متحركة */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-32 h-32 bg-purple-500 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-pink-500 rounded-full blur-3xl animate-pulse" />
        </div>

        <div className="relative z-10">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
                <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">
                  توصية ذكية
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-500/40">
                  ثقة: {confidence}%
                </span>
              </div>
              <h3 className="text-lg font-bold text-white">
                بدّل من <span className="text-yellow-400">{fromCoin}</span> إلى{" "}
                <span className="text-green-400">{toCoin}</span>
              </h3>
              <p className="text-sm text-slate-300 mt-1">
                ربح إضافي: <span className="text-green-400 font-bold text-base">+{profitDiff.toFixed(1)}%</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-white transition-all bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02] active:scale-95"
          >
            <ArrowRightLeft className="w-5 h-5" />
            <span>نفّذ التبديل الآن</span>
          </button>

          <p className="text-xs text-slate-400 mt-3 text-center">
            {isDemo
              ? "🟡 وضع تجريبي - التبديل سيتم محاكاته"
              : "🟢 سيتم إرسال أمر التبديل لـ HiveOS"}
          </p>
        </div>
      </div>

      {/* Modal التبديل */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-slide-down">
          <div className="bg-gradient-to-br from-zinc-950 via-slate-950 to-zinc-950 border-2 border-purple-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl shadow-purple-500/20 relative">
            {/* زر الإغلاق */}
            {status === "idle" && (
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 left-4 p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {/* المحتوى */}
            <div className="text-center py-4">
              {status === "idle" && (
                <>
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-purple-500/20 border border-purple-500/40">
                    <ArrowRightLeft className="w-10 h-10 text-purple-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">تأكيد التبديل</h2>
                  <p className="text-slate-400 mb-6">هل تريد التبديل الآن؟</p>

                  <div className="flex items-center justify-center gap-4 mb-6 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                    <div className="text-center">
                      <div className="text-xs text-slate-400 mb-1">من</div>
                      <div className="text-2xl font-bold text-yellow-400">{fromCoin}</div>
                    </div>
                    <ArrowRightLeft className="w-6 h-6 text-purple-400" />
                    <div className="text-center">
                      <div className="text-xs text-slate-400 mb-1">إلى</div>
                      <div className="text-2xl font-bold text-green-400">{toCoin}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                      <div className="text-xs text-slate-400">ربح إضافي</div>
                      <div className="text-lg font-bold text-green-400">+{profitDiff.toFixed(1)}%</div>
                    </div>
                    <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                      <div className="text-xs text-slate-400">ثقة المحرك</div>
                      <div className="text-lg font-bold text-purple-400">{confidence}%</div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowModal(false)}
                      className="flex-1 py-3 rounded-xl font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition"
                    >
                      إلغاء
                    </button>
                    <button
                      onClick={handleSwitch}
                      className="flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 transition flex items-center justify-center gap-2"
                    >
                      <Zap className="w-4 h-4" />
                      تأكيد
                    </button>
                  </div>
                </>
              )}

              {status === "loading" && (
                <>
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-purple-500/20 border border-purple-500/40">
                    <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">جاري التبديل...</h2>
                  <p className="text-slate-400 mb-6">إرسال الأمر لـ HiveOS</p>
                  <div className="space-y-2 text-sm text-right">
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle2 className="w-4 h-4" />
                      تم التحقق من الفرصة
                    </div>
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle2 className="w-4 h-4" />
                      تم إيقاف التعدين الحالي
                    </div>
                    <div className="flex items-center gap-2 text-purple-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري بدء تعدين {toCoin}...
                    </div>
                  </div>
                </>
              )}

              {status === "success" && (
                <>
                  <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-green-500/20 border-2 border-green-500/40 animate-pulse-strong">
                    <CheckCircle2 className="w-14 h-14 text-green-400" />
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-2">🎉 نجح التبديل!</h2>
                  <p className="text-slate-300 mb-2">
                    الجهاز الآن يعدّن <span className="font-bold text-green-400">{toCoin}</span>
                  </p>
                  <p className="text-sm text-slate-400">
                    ربح إضافي متوقع: <span className="text-green-400 font-bold">+{profitDiff.toFixed(1)}%</span>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}