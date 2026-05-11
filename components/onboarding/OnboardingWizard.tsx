"use client";

import { useState } from "react";
import {
  Cpu,
  GraduationCap,
  Rocket,
  MonitorSmartphone,
  Key,
  DollarSign,
  Zap,
  Coins,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDemoMode } from "@/components/providers/demo-provider";
import { useSettings } from "@/components/providers/settings-provider";

const AVAILABLE_COINS = [
  { symbol: "ERGO", name: "Ergo", emoji: "🟠" },
  { symbol: "KAS", name: "Kaspa", emoji: "🟢" },
  { symbol: "ETC", name: "Ethereum Classic", emoji: "🔵" },
  { symbol: "RVN", name: "Ravencoin", emoji: "🟣" },
  { symbol: "FLUX", name: "Flux", emoji: "⚡" },
  { symbol: "ALPH", name: "Alephium", emoji: "🌟" },
];

export function OnboardingWizard() {
  const { onboarding, isReady, completeOnboarding } = useDemoMode();
  const { updateSettings } = useSettings();

  const [step, setStep] = useState(0);
  const [hasRig, setHasRig] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "fail">("idle");

  // Form data
  const [gpuType, setGpuType] = useState("RTX 3070");
  const [gpuCount, setGpuCount] = useState(1);
  const [hiveosToken, setHiveosToken] = useState("");
  const [hiveosFarmId, setHiveosFarmId] = useState("");
  const [budget, setBudget] = useState(0);
  const [capital, setCapital] = useState(0);
  const [electricityPrice, setElectricityPrice] = useState(0.12);
  const [enabledCoins, setEnabledCoins] = useState<string[]>(["ERGO", "KAS", "ETC"]);

  if (!isReady || onboarding.completed) return null;

  const totalSteps = hasRig ? 7 : 1;

  const handleNoRig = () => {
    completeOnboarding({
      hasRig: false,
      mode: "demo",
      gpuType: "",
      gpuCount: 0,
    });
    updateSettings({
      gpuType: "RTX 3070",
      gpuCount: 1,
      budget: 100,
      capital: 0,
      currentCoin: "ERGO",
      enabledCoins: ["ERGO", "KAS", "ETC"],
    });
  };

  const handleStartLive = () => {
    setHasRig(true);
    setStep(1);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult("idle");
    // محاكاة اختبار الاتصال
    await new Promise((r) => setTimeout(r, 2000));
    if (hiveosToken.length > 5 && hiveosFarmId.length > 2) {
      setTestResult("success");
    } else {
      setTestResult("fail");
    }
    setTesting(false);
  };

  const toggleCoin = (symbol: string) => {
    setEnabledCoins((prev) =>
      prev.includes(symbol) ? prev.filter((c) => c !== symbol) : [...prev, symbol]
    );
  };

  const handleFinish = () => {
    updateSettings({
      gpuType,
      gpuCount,
      hiveosToken,
      hiveosFarmId,
      hiveosConnected: testResult === "success",
      budget,
      capital,
      electricityPrice,
      enabledCoins,
      currentCoin: enabledCoins[0] || "ERGO",
    });
    completeOnboarding({
      hasRig: true,
      mode: "live",
      gpuType,
      gpuCount,
    });
  };

  const canProceed = () => {
    if (step === 1) return gpuType && gpuCount > 0;
    if (step === 2) return true; // HiveOS optional
    if (step === 3) return budget >= 0 && capital >= 0;
    if (step === 4) return electricityPrice > 0;
    if (step === 5) return enabledCoins.length > 0;
    if (step === 6) return true;
    return false;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl border-emerald-500/20 bg-gradient-to-br from-zinc-950 via-slate-950 to-zinc-950 text-white shadow-2xl shadow-emerald-500/10 my-4">
        {/* Progress Bar */}
        {step > 0 && (
          <div className="px-6 pt-4">
            <div className="flex items-center justify-between mb-2 text-xs text-zinc-400">
              <span>الخطوة {step} من {totalSteps - 1}</span>
              <span>{Math.round((step / (totalSteps - 1)) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500 ease-out"
                style={{ width: `${(step / (totalSteps - 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* STEP 0: Welcome */}
        {step === 0 && (
          <>
            <CardHeader className="space-y-4 text-center pt-8">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 border border-emerald-500/40 shadow-lg shadow-emerald-500/20">
                <Rocket className="h-10 w-10 text-emerald-400" />
              </div>
              <CardTitle className="text-2xl md:text-3xl bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                مرحباً بك في General Mining OS 👑
              </CardTitle>
              <p className="text-sm text-zinc-400 md:text-base px-4">
                خلّينا نجهز النظام حسب وضعك الحالي
              </p>
            </CardHeader>

            <CardContent className="space-y-6 px-6 pb-6">
              <div className="grid gap-4 md:grid-cols-2">
                <button
                  onClick={handleNoRig}
                  className="group rounded-2xl border-2 border-zinc-800 bg-zinc-900/50 p-6 text-right transition-all hover:border-emerald-500 hover:bg-zinc-800/70 hover:scale-[1.02] hover:shadow-lg hover:shadow-emerald-500/20"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 transition">
                      <GraduationCap className="h-6 w-6 text-emerald-400" />
                    </div>
                    <h3 className="text-lg font-bold">أريد أتعلم أولاً</h3>
                  </div>
                  <p className="text-sm text-zinc-400">
                    وضع تجريبي ببيانات واقعية للتعلم بدون أجهزة حقيقية
                  </p>
                </button>

                <button
                  onClick={handleStartLive}
                  className="group rounded-2xl border-2 border-zinc-800 bg-zinc-900/50 p-6 text-right transition-all hover:border-blue-500 hover:bg-zinc-800/70 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/20"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 transition">
                      <Cpu className="h-6 w-6 text-blue-400" />
                    </div>
                    <h3 className="text-lg font-bold">عندي جهاز تعدين</h3>
                  </div>
                  <p className="text-sm text-zinc-400">
                    إعداد كامل مع HiveOS والميزانية والعملات
                  </p>
                </button>
              </div>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200/80 flex items-start gap-2">
                <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>تقدر تغيّر الوضع لاحقاً من الإعدادات في أي وقت</span>
              </div>
            </CardContent>
          </>
        )}

        {/* STEP 1: GPU Setup */}
        {step === 1 && (
          <>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <MonitorSmartphone className="w-5 h-5 text-blue-400" />
                </div>
                <CardTitle className="text-lg">إعداد العتاد</CardTitle>
              </div>
              <p className="text-sm text-zinc-400">معلومات الـ GPU عندك</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-sm text-zinc-300 mb-2 block">نوع الـ GPU</label>
                <select
                  value={gpuType}
                  onChange={(e) => setGpuType(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
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
                  <option value="RX 7900 XT">RX 7900 XT</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-zinc-300 mb-2 block">عدد الكروت</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={gpuCount}
                  onChange={(e) => setGpuCount(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                />
              </div>
            </CardContent>
          </>
        )}

        {/* STEP 2: HiveOS */}
        {step === 2 && (
          <>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <Key className="w-5 h-5 text-purple-400" />
                </div>
                <CardTitle className="text-lg">ربط HiveOS</CardTitle>
              </div>
              <p className="text-sm text-zinc-400">للتحكم في جهازك من التطبيق (اختياري)</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-sm text-zinc-300 mb-2 flex items-center justify-between">
                  <span>🔑 HiveOS API Token</span>
                  <a
                    href="https://the.hiveos.farm/account#tab=api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-400 hover:underline"
                  >
                    كيف أحصل عليه؟
                  </a>
                </label>
                <input
                  type="password"
                  value={hiveosToken}
                  onChange={(e) => setHiveosToken(e.target.value)}
                  placeholder="أدخل الـ Token من حسابك"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-300 mb-2 block">🆔 Farm ID</label>
                <input
                  type="text"
                  value={hiveosFarmId}
                  onChange={(e) => setHiveosFarmId(e.target.value)}
                  placeholder="مثال: 123456"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition"
                />
              </div>

              <button
                onClick={testConnection}
                disabled={testing || !hiveosToken || !hiveosFarmId}
                className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  testResult === "success"
                    ? "bg-green-500 text-white"
                    : testResult === "fail"
                    ? "bg-red-500 text-white"
                    : "bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <>❌ فشل الاتصال - تحقق من البيانات</>
                ) : (
                  <>اختبار الاتصال</>
                )}
              </button>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
                💡 <strong>تخطّ هذه الخطوة</strong> لو ما عندك HiveOS بعد. تقدر تضيفه لاحقاً من الإعدادات.
              </div>
            </CardContent>
          </>
        )}

        {/* STEP 3: Financial */}
        {step === 3 && (
          <>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <DollarSign className="w-5 h-5 text-yellow-400" />
                </div>
                <CardTitle className="text-lg">الميزانية ورأس المال</CardTitle>
              </div>
              <p className="text-sm text-zinc-400">عشان نبني خطط نمو ذكية لك</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-sm text-zinc-300 mb-2 block">💰 الميزانية الحالية ($)</label>
                <input
                  type="number"
                  min={0}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  placeholder="مثال: 300"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 transition text-2xl font-bold"
                />
                <p className="text-xs text-zinc-500 mt-1">المبلغ اللي معك الآن للاستثمار</p>
              </div>
              <div>
                <label className="text-sm text-zinc-300 mb-2 block">💎 رأس المال المستثمر ($)</label>
                <input
                  type="number"
                  min={0}
                  value={capital}
                  onChange={(e) => setCapital(Number(e.target.value))}
                  placeholder="مثال: 700"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 transition text-2xl font-bold"
                />
                <p className="text-xs text-zinc-500 mt-1">المبلغ اللي صرفته على المعدات</p>
              </div>
            </CardContent>
          </>
        )}

        {/* STEP 4: Electricity */}
        {step === 4 && (
          <>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <Zap className="w-5 h-5 text-orange-400" />
                </div>
                <CardTitle className="text-lg">سعر الكهرباء</CardTitle>
              </div>
              <p className="text-sm text-zinc-400">لحساب الأرباح الصافية</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-sm text-zinc-300 mb-2 block">⚡ سعر الكيلوواط/ساعة ($)</label>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  value={electricityPrice}
                  onChange={(e) => setElectricityPrice(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition text-2xl font-bold"
                />
                <p className="text-xs text-zinc-500 mt-2">
                  💡 المغرب ~$0.12 | السعودية ~$0.05 | مصر ~$0.03
                </p>
              </div>
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-sm text-orange-200/80">
                ⚡ <strong>إذا تستخدم طاقة شمسية:</strong> ضع 0
              </div>
            </CardContent>
          </>
        )}

        {/* STEP 5: Coins */}
        {step === 5 && (
          <>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-pink-500/10 border border-pink-500/20">
                  <Coins className="w-5 h-5 text-pink-400" />
                </div>
                <CardTitle className="text-lg">العملات اللي تتعدنها</CardTitle>
              </div>
              <p className="text-sm text-zinc-400">اختر العملات اللي يقدر يبدّل بينها</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {AVAILABLE_COINS.map((coin) => {
                const selected = enabledCoins.includes(coin.symbol);
                return (
                  <button
                    key={coin.symbol}
                    onClick={() => toggleCoin(coin.symbol)}
                    className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between ${
                      selected
                        ? "border-pink-500 bg-pink-500/10 shadow-lg shadow-pink-500/20"
                        : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{coin.emoji}</span>
                      <div className="text-right">
                        <div className="font-bold">{coin.symbol}</div>
                        <div className="text-xs text-zinc-400">{coin.name}</div>
                      </div>
                    </div>
                    {selected && <CheckCircle2 className="w-5 h-5 text-pink-400" />}
                  </button>
                );
              })}
            </CardContent>
          </>
        )}

        {/* STEP 6: Summary */}
        {step === 6 && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 border border-emerald-500/40">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <CardTitle className="text-xl bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                كل شي جاهز!
              </CardTitle>
              <p className="text-sm text-zinc-400">راجع المعلومات قبل البداية</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <SummaryItem label="GPU" value={`${gpuType} × ${gpuCount}`} />
              <SummaryItem label="HiveOS" value={testResult === "success" ? "✅ متصل" : "⏸️ غير متصل"} />
              <SummaryItem label="الميزانية" value={`$${budget}`} />
              <SummaryItem label="رأس المال" value={`$${capital}`} />
              <SummaryItem label="الكهرباء" value={`$${electricityPrice}/kWh`} />
              <SummaryItem label="العملات" value={enabledCoins.join(", ")} />
            </CardContent>
          </>
        )}

        {/* Navigation */}
        {step > 0 && (
          <div className="flex items-center justify-between gap-3 p-6 pt-0">
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              رجوع
            </Button>
            {step < 6 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700"
              >
                التالي
                <ArrowLeft className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleFinish}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700"
              >
                <Rocket className="w-4 h-4" />
                ابدأ الآن!
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  );
}