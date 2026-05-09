"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

export type NotificationType = "success" | "warning" | "danger" | "info";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  coin?: string;
  timestamp: number;
  read: boolean;
};

type NotificationsContextType = {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
};

const STORAGE_KEY = "gmos-notifications";
const SOUND_KEY = "gmos-sound-enabled";

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

// 🔊 صوت التنبيه (base64 - بدون ملف خارجي)
const NOTIFICATION_SOUND_URL =
  "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQBvAAAA";

function playNotificationSound() {
  try {
    // استخدام Web Audio API لتوليد صوت بسيط
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // نغمة جذابة (دو - مي - صول)
    oscillator.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
    oscillator.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.log("Sound failed:", e);
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // تحميل من localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setNotifications(JSON.parse(saved));

      const sound = localStorage.getItem(SOUND_KEY);
      if (sound !== null) setSoundEnabled(sound === "true");
    } catch {}
  }, []);

  // حفظ في localStorage
  useEffect(() => {
    try {
      // نحفظ آخر 50 تنبيه فقط
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 50)));
    } catch {}
  }, [notifications]);

  const addNotification = useCallback(
    (n: Omit<Notification, "id" | "timestamp" | "read">) => {
      const newNotif: Notification = {
        ...n,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        read: false,
      };

      setNotifications((prev) => [newNotif, ...prev].slice(0, 50));

      // 🔊 شغل الصوت
      if (soundEnabled && typeof window !== "undefined") {
        playNotificationSound();
      }

      // 📱 Browser notification (إذا مسموح)
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(newNotif.title, {
            body: newNotif.message,
            icon: "/favicon.ico",
          });
        } catch {}
      }
    },
    [soundEnabled]
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const newVal = !prev;
      localStorage.setItem(SOUND_KEY, String(newVal));
      return newVal;
    });
  }, []);

  // طلب صلاحية الإشعارات أول مرة
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
      soundEnabled,
      toggleSound,
    }),
    [notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll, soundEnabled, toggleSound]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}