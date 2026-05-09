"use client";

import { useEffect, useRef } from "react";
import { useDemoMode } from "@/components/providers/demo-provider";
import { useNotifications, NotificationType } from "@/components/providers/notifications-provider";

type AlertTemplate = {
  type: NotificationType;
  title: string;
  message: string;
  coin?: string;
};

const ALERT_TEMPLATES: AlertTemplate[] = [
  {
    type: "success",
    title: "🚀 فرصة قوية!",
    message: "KAS صعدت +18% آخر ساعة. ربح أعلى بـ 47% من ERGO الحالية!",
    coin: "KAS",
  },
  {
    type: "warning",
    title: "🌡️ حرارة مرتفعة",
    message: "حرارة GPU وصلت 74°C. تحقق من المراوح والتهوية.",
  },
  {
    type: "info",
    title: "💰 تقرير الربح",
    message: "ربح آخر ساعة: $0.024. الربح اليومي المتوقع: $0.58",
  },
  {
    type: "success",
    title: "☀️ ذروة الشمس!",
    message: "إنتاج الألواح وصل 1180W. وقت ممتاز للتعدين بدون كهرباء!",
  },
  {
    type: "warning",
    title: "📉 ERGO تتراجع",
    message: "ERGO نزلت -4.2%. فكّر في التبديل لعملة أكثر استقراراً.",
    coin: "ERGO",
  },
  {
    type: "info",
    title: "🔋 البطارية ممتلئة",
    message: "البطارية وصلت 95%. الفائض سيذهب للتعدين الإضافي.",
  },
  {
    type: "success",
    title: "💎 صفقة ذهبية",
    message: "الفرق بين أفضل عملة وعملتك الحالية: 32%! وقت التبديل!",
    coin: "ETC",
  },
  {
    type: "danger",
    title: "⚠️ Difficulty ارتفعت",
    message: "صعوبة تعدين ERGO ارتفعت +15%. الربح راح ينخفض اليوم.",
    coin: "ERGO",
  },
  {
    type: "info",
    title: "📊 تحديث السوق",
    message: "حجم تداول KAS ارتفع 274% آخر 24 ساعة. اهتمام متزايد.",
    coin: "KAS",
  },
  {
    type: "success",
    title: "✅ تبديل ناجح",
    message: "تم التبديل لـ KAS بنجاح. الجهاز يعدّن الآن.",
    coin: "KAS",
  },
];

/**
 * 🎮 Hook يولّد تنبيهات تجريبية كل 30-60 ثانية في Demo Mode
 */
export function useSimulatedAlerts() {
  const { isDemo, isReady } = useDemoMode();
  const { addNotification } = useNotifications();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (!isReady || !isDemo) return;

    // أول تنبيه بعد 8 ثواني (ترحيب)
    if (isFirstRun.current) {
      isFirstRun.current = false;
      const welcomeTimer = setTimeout(() => {
        addNotification({
          type: "success",
          title: "👋 مرحباً يا الجنرال!",
          message: "النظام يراقب السوق الآن. ستصلك التنبيهات تلقائياً!",
        });
      }, 8000);

      return () => clearTimeout(welcomeTimer);
    }
  }, [isReady, isDemo, addNotification]);

  useEffect(() => {
    if (!isReady || !isDemo) return;

    const scheduleNext = () => {
      // كل 30-60 ثانية، تنبيه عشوائي
      const delay = 30000 + Math.random() * 30000;

      timerRef.current = setTimeout(() => {
        const template = ALERT_TEMPLATES[Math.floor(Math.random() * ALERT_TEMPLATES.length)];
        addNotification(template);
        scheduleNext();
      }, delay);
    };

    // أول تنبيه عشوائي بعد 20 ثانية
    const initialTimer = setTimeout(() => {
      const template = ALERT_TEMPLATES[Math.floor(Math.random() * ALERT_TEMPLATES.length)];
      addNotification(template);
      scheduleNext();
    }, 20000);

    return () => {
      clearTimeout(initialTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isReady, isDemo, addNotification]);
}