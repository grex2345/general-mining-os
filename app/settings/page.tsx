"use client";

import { useState } from "react";
import {
  Settings as SettingsIcon,
  Bell,
  Palette,
  Database,
  Shield,
  Monitor,
  Save,
  Check,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// ⚙️ SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  // Settings state
  const [settings, setSettings] = useState({
    notifications: true,
    soundAlerts: true,
    autoRefresh: true,
    refreshInterval: 60,
    theme: "dark",
    language: "ar",
    showHiddenGems: true,
    showPumpAlerts: true,
    showDeadCoins: true,
    minConfidence: 60,
  });

  function handleSave() {
    // TODO: Save to backend/localStorage
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 blur-xl" />
            <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <SettingsIcon className="w-6 h-6 text-black" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              الإعدادات
            </h1>
            <p className="text-sm text-slate-400">
              إدارة تفضيلاتك ومعرفتك بالنظام
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className={`
            inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm
            transition-all
            ${
              saved
                ? "bg-emerald-500 text-black"
                : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
            }
          `}
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" />
              تم الحفظ
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              حفظ التغييرات
            </>
          )}
        </button>
      </div>

      {/* NOTIFICATIONS */}
      <SettingsSection icon={Bell} title="التنبيهات" iconColor="text-amber-400" iconBg="bg-amber-500/10">
        <ToggleSetting
          label="تفعيل التنبيهات"
          description="استقبال تنبيهات الفرص الجديدة والتغيرات المهمة"
          checked={settings.notifications}
          onChange={(v) => setSettings({ ...settings, notifications: v })}
        />
        <ToggleSetting
          label="التنبيهات الصوتية"
          description="تشغيل صوت عند ظهور فرصة جديدة"
          checked={settings.soundAlerts}
          onChange={(v) => setSettings({ ...settings, soundAlerts: v })}
        />
      </SettingsSection>

      {/* RADAR FILTERS */}
      <SettingsSection icon={Database} title="فلاتر الرادار" iconColor="text-emerald-400" iconBg="bg-emerald-500/10">
        <ToggleSetting
          label="عرض الجواهر المخفية 💎"
          description="إظهار العملات الصغيرة بإمكانيات نمو"
          checked={settings.showHiddenGems}
          onChange={(v) => setSettings({ ...settings, showHiddenGems: v })}
        />
        <ToggleSetting
          label="عرض تحذيرات الـ Pump 🚀"
          description="إظهار العملات بحركة سعرية قوية"
          checked={settings.showPumpAlerts}
          onChange={(v) => setSettings({ ...settings, showPumpAlerts: v })}
        />
        <ToggleSetting
          label="عرض العملات الميتة 💀"
          description="إظهار التحذيرات للعملات في خطر"
          checked={settings.showDeadCoins}
          onChange={(v) => setSettings({ ...settings, showDeadCoins: v })}
        />

        <div className="pt-4 border-t border-white/[0.06]">
          <label className="block text-sm font-medium text-white mb-2">
            الحد الأدنى للثقة: {settings.minConfidence}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.minConfidence}
            onChange={(e) => setSettings({ ...settings, minConfidence: parseInt(e.target.value) })}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      </SettingsSection>

      {/* DISPLAY */}
      <SettingsSection icon={Monitor} title="العرض والتحديث" iconColor="text-blue-400" iconBg="bg-blue-500/10">
        <ToggleSetting
          label="تحديث تلقائي"
          description="تحديث البيانات تلقائياً كل فترة"
          checked={settings.autoRefresh}
          onChange={(v) => setSettings({ ...settings, autoRefresh: v })}
        />

        {settings.autoRefresh && (
          <div className="pt-4 border-t border-white/[0.06]">
            <label className="block text-sm font-medium text-white mb-2">
              فترة التحديث: {settings.refreshInterval} ثانية
            </label>
            <input
              type="range"
              min="30"
              max="600"
              step="30"
              value={settings.refreshInterval}
              onChange={(e) => setSettings({ ...settings, refreshInterval: parseInt(e.target.value) })}
              className="w-full accent-emerald-500"
            />
          </div>
        )}
      </SettingsSection>

      {/* APPEARANCE */}
      <SettingsSection icon={Palette} title="المظهر" iconColor="text-purple-400" iconBg="bg-purple-500/10">
        <div>
          <label className="block text-sm font-medium text-white mb-3">المظهر</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "dark", label: "داكن", recommended: true },
              { value: "light", label: "فاتح", disabled: true },
            ].map((theme) => (
              <button
                key={theme.value}
                disabled={theme.disabled}
                onClick={() => setSettings({ ...settings, theme: theme.value })}
                className={`
                  relative px-4 py-3 rounded-lg text-sm font-medium border transition-all
                  ${
                    settings.theme === theme.value
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.05]"
                  }
                  ${theme.disabled ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                {theme.label}
                {theme.recommended && (
                  <span className="absolute top-1 right-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[8px] font-bold rounded">
                    موصى
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </SettingsSection>

      {/* ABOUT */}
      <SettingsSection icon={Shield} title="حول النظام" iconColor="text-pink-400" iconBg="bg-pink-500/10">
        <InfoRow label="الإصدار" value="v0.3.0 Pro Edition" />
        <InfoRow label="قاعدة البيانات" value="SQLite (محلية)" />
        <InfoRow label="عدد العملات" value="30 عملة قابلة للتعدين" />
        <InfoRow label="آخر تحديث" value="2026-05-12" />
      </SettingsSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🎨 SUB COMPONENTS
// ═══════════════════════════════════════════════════════════════
function SettingsSection({
  icon: Icon,
  title,
  iconColor,
  iconBg,
  children,
}: {
  icon: React.ElementType;
  title: string;
  iconColor: string;
  iconBg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center`}>
          <Icon className="w-4 h-4" strokeWidth={2} />
        </div>
        <h2 className="text-base font-bold text-white">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`
          relative w-11 h-6 rounded-full transition-colors flex-shrink-0
          ${checked ? "bg-emerald-500" : "bg-white/[0.08]"}
        `}
      >
        <div
          className={`
            absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-lg
            ${checked ? "right-0.5" : "right-[22px]"}
          `}
        />
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-white font-medium font-mono">{value}</span>
    </div>
  );
}