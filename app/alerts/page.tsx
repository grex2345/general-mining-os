"use client";

import StatCard from "@/components/cards/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, AlertTriangle, CheckCircle2, Info, AlertCircle, Trash2, Check } from "lucide-react";
import { useNotifications, NotificationType } from "@/components/providers/notifications-provider";

const typeConfig: Record<NotificationType, { icon: typeof CheckCircle2; color: string; border: string; bg: string; label: string; badge: "default" | "secondary" | "destructive" | "outline" }> = {
  success: { icon: CheckCircle2, color: "text-green-400", border: "border-green-500/30", bg: "bg-green-500/5", label: "إيجابي", badge: "default" },
  warning: { icon: AlertTriangle, color: "text-yellow-400", border: "border-yellow-500/30", bg: "bg-yellow-500/5", label: "تحذير", badge: "secondary" },
  danger: { icon: AlertCircle, color: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/5", label: "خطر", badge: "destructive" },
  info: { icon: Info, color: "text-blue-400", border: "border-blue-500/30", bg: "bg-blue-500/5", label: "معلومة", badge: "outline" },
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "الآن";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

export default function AlertsPage() {
  const { notifications, markAllAsRead, clearAll } = useNotifications();

  const counts = {
    total: notifications.length,
    success: notifications.filter((a) => a.type === "success").length,
    warning: notifications.filter((a) => a.type === "warning").length,
    info: notifications.filter((a) => a.type === "info").length,
    danger: notifications.filter((a) => a.type === "danger").length,
  };

  return (
    <>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">التنبيهات 🔔</h1>
          <p className="text-sm text-slate-400 mt-1">
            آخر الإشعارات من المحرك الذكي
          </p>
        </div>
        {notifications.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
            >
              <Check className="w-3.5 h-3.5" />
              قراءة الكل
            </button>
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف الكل
            </button>
          </div>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="إجمالي التنبيهات" value={counts.total.toString()} subValue="آخر 24h" iconName="check" status="neutral" />
        <StatCard label="فرص" value={counts.success.toString()} subValue="إيجابية" iconName="check" status="good" />
        <StatCard label="تحذيرات" value={counts.warning.toString()} subValue="انتبه" iconName="thermometer" status="warning" />
        <StatCard label="معلومات" value={counts.info.toString()} subValue="عامة" iconName="check" status="neutral" />
      </section>

      {notifications.length === 0 ? (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-12 text-center">
            <Bell className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-400 mb-2">لا توجد تنبيهات بعد</h3>
            <p className="text-sm text-slate-500">
              النظام يراقب السوق الآن. ستظهر التنبيهات هنا تلقائياً 🚀
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((alert) => {
            const cfg = typeConfig[alert.type];
            const Icon = cfg.icon;

            return (
              <Card key={alert.id} className={`bg-slate-900/60 ${cfg.border} ${!alert.read ? "ring-1 ring-yellow-500/30" : ""} animate-slide-in-right`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${cfg.bg} ${!alert.read ? "animate-pulse" : ""}`}>
                      <Icon className={`w-5 h-5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          {alert.title}
                          {!alert.read && <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />}
                        </h3>
                        <div className="flex items-center gap-2">
                          {alert.coin && (
                            <Badge variant="outline" className="text-xs">{alert.coin}</Badge>
                          )}
                          <Badge variant={cfg.badge} className="text-xs">{cfg.label}</Badge>
                        </div>
                      </div>
                      <p className="text-sm text-slate-400 mb-2">{alert.message}</p>
                      <p className="text-xs text-slate-500">{formatRelativeTime(alert.timestamp)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-blue-500/5 border-blue-500/30 mt-6">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <Bell className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-300">
              💡 لاحقاً: ربط Telegram Bot ليرسل التنبيهات مباشرة لهاتفك.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}