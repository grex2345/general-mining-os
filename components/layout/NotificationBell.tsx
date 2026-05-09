"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Volume2, VolumeX, Check, Trash2, AlertTriangle, CheckCircle2, Info, AlertCircle } from "lucide-react";
import { useNotifications, NotificationType } from "@/components/providers/notifications-provider";

const typeIcons: Record<NotificationType, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
};

const typeColors: Record<NotificationType, string> = {
  success: "text-green-400 bg-green-500/10 border-green-500/30",
  warning: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  danger: "text-red-400 bg-red-500/10 border-red-500/30",
  info: "text-blue-400 bg-blue-500/10 border-blue-500/30",
};

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `الآن`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, soundEnabled, toggleSound } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // إغلاق الـ dropdown عند الضغط خارجه
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleNotifClick = (id: string) => {
    markAsRead(id);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 🔔 الجرس */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg hover:bg-slate-800 transition-all ${
          unreadCount > 0 ? "text-yellow-400 animate-bell-shake" : "text-slate-400 hover:text-white"
        }`}
        aria-label="التنبيهات"
      >
        <Bell className="w-5 h-5" />

        {/* 🔴 العداد الأحمر */}
        {unreadCount > 0 && (
          <>
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse-strong border-2 border-slate-950">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
            {/* وهج أحمر */}
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 animate-ping opacity-75" />
          </>
        )}
      </button>

      {/* 📋 Dropdown قائمة التنبيهات */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 sm:w-96 max-h-[500px] overflow-hidden bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 animate-slide-down">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-bold text-white">
                التنبيهات {unreadCount > 0 && <span className="text-yellow-400">({unreadCount})</span>}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleSound}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                title={soundEnabled ? "إيقاف الصوت" : "تشغيل الصوت"}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              {notifications.length > 0 && (
                <>
                  <button
                    onClick={markAllAsRead}
                    className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                    title="قراءة الكل"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={clearAll}
                    className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-red-400 transition"
                    title="حذف الكل"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* قائمة التنبيهات */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-500">لا توجد تنبيهات</p>
                <p className="text-xs text-slate-600 mt-1">ستظهر هنا تلقائياً 🚀</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const Icon = typeIcons[notif.type];
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleNotifClick(notif.id)}
                    className={`w-full text-right p-3 border-b border-slate-800 hover:bg-slate-800/50 transition relative ${
                      !notif.read ? "bg-slate-800/30" : ""
                    }`}
                  >
                    {!notif.read && (
                      <span className="absolute top-3 left-3 w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    )}
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded-lg border ${typeColors[notif.type]} flex-shrink-0`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <h4 className={`text-xs font-bold ${notif.read ? "text-slate-300" : "text-white"}`}>
                            {notif.title}
                          </h4>
                          {notif.coin && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-purple-400 font-mono">
                              {notif.coin}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed mb-1">{notif.message}</p>
                        <p className="text-[10px] text-slate-600">{formatTime(notif.timestamp)}</p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-2 border-t border-slate-700 bg-slate-900/95">
              <a
                href="/alerts"
                className="block w-full text-center text-xs text-purple-400 hover:text-purple-300 py-1.5 transition"
              >
                عرض كل التنبيهات ←
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}