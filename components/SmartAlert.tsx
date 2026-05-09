"use client";

import { useState, useEffect } from "react";
import { Sparkles, X, ArrowRightLeft, Clock, BellOff } from "lucide-react";

interface SmartAlertProps {
  shouldShow: boolean;
  fromCoin: string;
  toCoin: string;
  profitDiff: number;
  reason: string;
}

const SNOOZE_KEY = "gmo_alert_snooze";
const QUIET_START = 22; // 10 المساء
const QUIET_END = 7;    // 7 الصباح

export default function SmartAlert({
  shouldShow,
  fromCoin,
  toCoin,
  profitDiff,
  reason,
}: SmartAlertProps) {
  const [visible, setVisible] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switched, setSwitched] = useState(false);

  // 🌙 شيك Quiet Hours
  const isQuietHours = () => {
    const hour = new Date().getHours();
    if (QUIET_START > QUIET_END) {
      return hour >= QUIET_START || hour < QUIET_END;
    }
    return hour >= QUIET_START && hour < QUIET_END;
  };

  // 🔕 شيك Snooze
  const isSnoozed = () => {
    const snoozeUntil = localStorage.getItem(SNOOZE_KEY);
    if (!snoozeUntil) return false;
    return Date.now() < parseInt(snoozeUntil);
  };

  // 📱 طلب إذن الإشعارات
  const requestNotificationPermission = async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  };

  // 📱 إرسال Browser Notification
  const sendBrowserNotification = () => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("🚨 الجنرال! فرصة ذهبية!", {
        body: `${toCoin} أفضل بـ ${profitDiff.toFixed(1)}% من ${fromCoin}`,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag: "gmo-alert",
      });
    }
  };

  useEffect(() => {
    requestNotificationPermission();

    if (shouldShow) {
      // ✋ شيك Snooze و Quiet Hours
      if (isSnoozed()) {
        console.log("🔕 التنبيه مؤجل");
        return;
      }
      if (isQuietHours()) {
        console.log("🌙 Quiet Hours - لا تنبيه");
        return;
      }

      setTimeout(() => {
        setVisible(true);
        playAlertSound();
        sendBrowserNotification();
      }, 1000);
    }
  }, [shouldShow]);

  // 🔄 Auto-refresh كل 5 دقائق
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("🔄 Auto-refresh...");
      window.location.reload();
    }, 5 * 60 * 1000); // 5 دقائق

    return () => clearInterval(interval);
  }, []);

  const playAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = 880;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.log("Audio not supported");
    }
  };

  const handleSwitch = async () => {
    setSwitching(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentMiningCoin: toCoin,
          electricityCost: 0.12,
          safeMode: true,
          minSwitchProfit: 8,
        }),
      });

      if (res.ok) {
        setSwitched(true);
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error) {
      console.error("فشل التحويل:", error);
      setSwitching(false);
    }
  };

  // 🔕 Snooze لمدة ساعة
  const handleSnooze = () => {
    const oneHour = Date.now() + 60 * 60 * 1000;
    localStorage.setItem(SNOOZE_KEY, oneHour.toString());
    setVisible(false);
  };

  if (!visible) return null;

  if (switched) {
    return (
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top duration-500">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl shadow-2xl p-6 min-w-[400px] border-2 border-green-400">
          <div className="flex items-center gap-3">
            <div className="text-4xl">✅</div>
            <div>
              <h3 className="text-white font-bold text-lg">تم التحويل بنجاح!</h3>
              <p className="text-green-100 text-sm">
                دابا تحفر <span className="font-bold">{toCoin}</span> 🚀
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top duration-500">
      <div className="bg-gradient-to-r from-purple-700 via-purple-600 to-pink-600 rounded-2xl shadow-2xl p-6 min-w-[450px] border-2 border-purple-400 relative">
        <button
          onClick={() => setVisible(false)}
          className="absolute top-3 left-3 text-white/70 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className="bg-white/20 p-3 rounded-xl">
            <Sparkles className="w-8 h-8 text-yellow-300 animate-pulse" />
          </div>

          <div className="flex-1">
            <h3 className="text-white font-bold text-xl mb-1">
              🚨 الجنرال! فرصة ذهبية!
            </h3>
            <p className="text-white/90 text-sm mb-2">
              <span className="font-bold text-yellow-200">{toCoin}</span> أفضل بـ{" "}
              <span className="font-bold text-yellow-200">{profitDiff.toFixed(1)}%</span>{" "}
              من <span className="font-bold">{fromCoin}</span>
            </p>
            <p className="text-white/70 text-xs mb-4">{reason}</p>

            <div className="flex gap-2 mb-2">
              <button
                onClick={handleSwitch}
                disabled={switching}
                className="flex-1 bg-white text-purple-700 font-bold py-3 px-4 rounded-xl hover:bg-yellow-300 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {switching ? (
                  <>⏳ جاري التحويل...</>
                ) : (
                  <>
                    <ArrowRightLeft className="w-4 h-4" />
                    حوّل دابا لـ {toCoin}
                  </>
                )}
              </button>

              <button
                onClick={() => setVisible(false)}
                disabled={switching}
                className="bg-white/20 text-white font-bold py-3 px-4 rounded-xl hover:bg-white/30 transition flex items-center gap-2"
              >
                <Clock className="w-4 h-4" />
                لاحقاً
              </button>
            </div>

            {/* 🔕 زر Snooze */}
            <button
              onClick={handleSnooze}
              disabled={switching}
              className="w-full text-white/70 hover:text-white text-xs flex items-center justify-center gap-1 py-2"
            >
              <BellOff className="w-3 h-3" />
              ما تنبهنيش لمدة ساعة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}