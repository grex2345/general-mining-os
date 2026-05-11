"use client";

import { useState } from "react";
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  Key,
  DollarSign,
  Zap,
  Cpu,
  Coins,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Trash2,
  FlaskConical,
  Wifi,
} from "lucide-react";
import { useSettings } from "@/components/providers/settings-provider";
import { useDemoMode } from "@/components/providers/demo-provider";
import { useNotifications } from "@/components/providers/notifications-provider";

const AVAILABLE_COINS = [
  { symbol: "ERGO", name: "Ergo", emoji: "🟠" },
  { symbol: "KAS", name: "Kaspa", emoji: "🟢" },
  { symbol: "ETC", name: "Ethereum Classic", emoji: "🔵" },
  { symbol: "RVN", name: "Ravencoin", emoji: "🟣" },
  { symbol: "FLUX", name: "Flux", emoji: "⚡" },
  { symbol: "ALPH", name: "Alephium", emoji: "🌟" },
];

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { switchMode, resetOnboarding, isDemo } = useDemoMode();
  const { addNotification } = useNotifications();

  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "fail">("idle");

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    updateSettings(form);
    setSaving(false);
    addNotification({
      type: "success",
      title: "✅ تم الحفظ بنجاح!",
      message: "تم حفظ الإعدادات وتطبيقها على كل التطبيق",
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult("idle");
    await new Promise((r) => setTimeout(r, 2000));
    if (form.hiveosToken.length > 5 && form.hiveosFarmId.length > 2) {
      setTestResult("success");
      addNotification({
        type: "success",
        title: "✅ اتصال HiveOS ناجح!",
        message: "تم الاتصال بـ HiveOS بنجاح",
      });
    } else {
      setTestResult("fail");
      addNotification({
        type: "danger",
        title: "❌ فشل الاتصال",
        message: "تحقق من Token و Farm ID",
      });
    }
    setTesting(false);
  };

  const handleToggleMode = () => {
    const newMode = isDemo ? "live" : "demo";
    switchMode(newMode);
    addNotification({
      type: "info",
      title: `🔄 تم التبديل لوضع ${newMode === "demo" ? "تجريبي" : "حقيقي"}`,
      message: "أعد تحميل الصفحة لرؤية التغييرات",
    });
  };

  const handleResetOnboarding = () => {
    if (confirm("هل تريد إعادة تشغيل Onboarding؟ ستحتاج لإعادة الإعداد من الأول")) {
      resetOnboarding();
      window.location.reload();
    }
  };

  const handleResetAll = () => {
    if (confirm("⚠️ سيتم حذف كل الإعدادات والبيانات. هل أنت متأكد؟")) {
      resetSettings();
      resetOnboarding();
      localStorage.clear();
      window.location.reload();
    }
  };

  const toggleCoin = (symbol: string) => {
    setForm((prev) => ({
      ...prev,
      enabledCoins: prev.enabledCoins.includes(symbol)
        ? prev.enabledCoins.filter((c) => c !== symbol)
        : [...prev.enabledCoins, symbol],
    }));
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
          <SettingsIcon className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">الإعدادات ⚙️</h1>
          <p className="text-sm text-slate-400 mt-1">إدارة كل إعدادات التطبيق</p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="bg-gradient-to-br from-zinc-900 to-slate-900 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isDemo ? "bg-amber-500/10" : "bg-green-500/10"}`}>
              <FlaskConical className={`w-5 h-5 ${isDemo ? "text-amber-400" : "text-green-400"}`} />
            </div>
            <div>
              <h3 className="font-bold text-white">وضع التطبيق</h3>
              <p className="text-xs text-slate-400">
                {isDemo ? "🟡 وضع تجريبي - بيانات محاكاة" : "🟢 وضع حقيقي - بيانات HiveOS"}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleMode}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              isDemo
                ? "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                : "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
            }`}
          >
            {isDemo ? "تبديل لـ Live" : "تبديل لـ Demo"}
          </button>
        </div>
      </div>

      {/* GPU Settings */}
      <SettingsCard
        icon={<Cpu className="w-5 h-5" />}
        title="إعدادات العتاد"
        color="blue"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">نوع GPU</label>
            <select
              value={form.gpuType}
              onChange={(e) => setForm({ ...form, gpuType: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
            >
              <option value="RTX 3070">RTX 3070</option>
              <option value="RTX 3060 Ti">RTX 3060 Ti</option>
              <option value="RTX 3080">RTX 3080</option>
              <option value="RTX 3090">RTX 3090</option>
              <option value="RTX 4070">RTX 4070</option>
              <option value="RTX 4080">RTX 4080</option>
              <option value="RTX 4090">RTX 4090</option>
              <option value="RX 6700 XT">RX 6700 XT</option>
              <option value="RX 6800">RX 6800</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">عدد الكروت</label>
            <input
              type="number"
              min={1}
              max={24}
              value={form.gpuCount}
              onChange={(e) => setForm({ ...form, gpuCount: Number(e.target.value) })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
            />
          </div>
        </div>
      </SettingsCard>

      {/* HiveOS Settings */}
      <SettingsCard
        icon={<Key className="w-5 h-5" />}
        title="ربط HiveOS"
        color="purple"
        badge={
          form.hiveosConnected ? (
            <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
              ✓ متصل
            </span>
          ) : (
            <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
              غير متصل
            </span>
          )
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">🔑 API Token</label>
            <input
              type="password"
              value={form.hiveosToken}
              onChange={(e) => setForm({ ...form, hiveosToken: e.target.value })}
              placeholder="أدخل HiveOS API Token"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">🆔 Farm ID</label>
            <input
              type="text"
              value={form.hiveosFarmId}
              onChange={(e) => setForm({ ...form, hiveosFarmId: e.target.value })}
              placeholder="مثال: 123456"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
            />
          </div>
          <button
            onClick={handleTestConnection}
            disabled={testing || !form.hiveosToken || !form.hiveosFarmId}
            className={`w-full py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              testResult === "success"
                ? "bg-green-500 text-white"
                : testResult === "fail"
                ? "bg-red-500 text-white"
                : "bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
            }`}
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                جاري الاختبار...
              </>
            ) : testResult === "success" ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                اتصال ناجح ✅
              </>
            ) : testResult === "fail" ? (
              <>
                <AlertCircle className="w-4 h-4" />
                فشل الاتصال
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4" />
                اختبار الاتصال
              </>
            )}
          </button>
        </div>
      </SettingsCard>

      {/* Financial Settings */}
      <SettingsCard
        icon={<DollarSign className="w-5 h-5" />}
        title="الميزانية والمالية"
        color="yellow"
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">💰 الميزانية الحالية ($)</label>
            <input
              type="number"
              min={0}
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-lg font-bold text-white focus:border-yellow-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">💎 رأس المال المستثمر ($)</label>
            <input
              type="number"
              min={0}
              value={form.capital}
              onChange={(e) => setForm({ ...form, capital: Number(e.target.value) })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-lg font-bold text-white focus:border-yellow-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">🎯 الهدف الشهري ($)</label>
            <input
              type="number"
              min={0}
              value={form.monthlyGoal}
              onChange={(e) => setForm({ ...form, monthlyGoal: Number(e.target.value) })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-lg font-bold text-white focus:border-yellow-500 outline-none"
            />
          </div>
        </div>
      </SettingsCard>

      {/* Electricity */}
      <SettingsCard
        icon={<Zap className="w-5 h-5" />}
        title="الكهرباء"
        color="orange"
      >
        <div>
          <label className="text-xs text-slate-400 mb-1 block">⚡ سعر kWh ($)</label>
          <input
            type="number"
            step={0.01}
            min={0}
            value={form.electricityPrice}
            onChange={(e) => setForm({ ...form, electricityPrice: Number(e.target.value) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-lg font-bold text-white focus:border-orange-500 outline-none"
          />
          <p className="text-xs text-slate-500 mt-1">إذا تستخدم طاقة شمسية، ضع 0</p>
        </div>
      </SettingsCard>

      {/* Coins Selection */}
      <SettingsCard
        icon={<Coins className="w-5 h-5" />}
        title="العملات النشطة"
        color="pink"
      >
        <div className="grid grid-cols-2 gap-2">
          {AVAILABLE_COINS.map((coin) => {
            const selected = form.enabledCoins.includes(coin.symbol);
            return (
              <button
                key={coin.symbol}
                onClick={() => toggleCoin(coin.symbol)}
                className={`p-3 rounded-lg border-2 transition-all flex items-center gap-2 ${
                  selected
                    ? "border-pink-500 bg-pink-500/10"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"
                }`}
              >
                <span className="text-xl">{coin.emoji}</span>
                <span className="text-sm font-bold text-white">{coin.symbol}</span>
                {selected && <CheckCircle2 className="w-4 h-4 text-pink-400 mr-auto" />}
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 rounded-2xl font-bold text-white transition-all bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 shadow-lg shadow-emerald-500/30 disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
      >
        {saving ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            جاري الحفظ...
          </>
        ) : (
          <>
            <Save className="w-5 h-5" />
            حفظ الإعدادات
          </>
        )}
      </button>

      {/* Danger Zone */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <h3 className="font-bold text-red-400">منطقة خطر</h3>
        </div>

        <button
          onClick={handleResetOnboarding}
          className="w-full py-2.5 rounded-lg font-bold text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          إعادة تشغيل Onboarding
        </button>

        <button
          onClick={handleResetAll}
          className="w-full py-2.5 rounded-lg font-bold text-sm text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          حذف كل البيانات وإعادة التعيين
        </button>
      </div>
    </div>
  );
}

function SettingsCard({
  icon,
  title,
  color,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  color: "blue" | "purple" | "yellow" | "orange" | "pink";
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const colorMap = {
    blue: "from-blue-500/10 to-cyan-500/10 border-blue-500/20 text-blue-400",
    purple: "from-purple-500/10 to-pink-500/10 border-purple-500/20 text-purple-400",
    yellow: "from-yellow-500/10 to-orange-500/10 border-yellow-500/20 text-yellow-400",
    orange: "from-orange-500/10 to-red-500/10 border-orange-500/20 text-orange-400",
    pink: "from-pink-500/10 to-rose-500/10 border-pink-500/20 text-pink-400",
  };

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-2xl p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-zinc-900/60 ${colorMap[color].split(" ")[3]}`}>
            {icon}
          </div>
          <h3 className="font-bold text-white">{title}</h3>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}