import StatCard from "@/components/cards/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { USD_TO_MAD } from "@/lib/constants/config";
import { Sun, Zap, Battery, Trophy } from "lucide-react";

const INITIAL_INVESTMENT = 6850;
const BATTERY_COST = 6500;
const PROFIT_PER_HOUR = 0.55 / 8;
const NIGHT_HOURS = 16;
const ELECTRICITY_COST_PER_KWH_MAD = 1.2;
const GPU_POWER_KW = 0.125;

const NIGHT_KWH = GPU_POWER_KW * NIGHT_HOURS;
const NIGHT_COST_MAD = NIGHT_KWH * ELECTRICITY_COST_PER_KWH_MAD;
const NIGHT_COST_USD = NIGHT_COST_MAD / USD_TO_MAD;
const NIGHT_PROFIT_GROSS = PROFIT_PER_HOUR * NIGHT_HOURS;

const SETUPS = [
  {
    id: "solar-only",
    name: "شمسي فقط (8h)",
    icon: Sun,
    color: "text-yellow-400",
    profitDay: 0.55,
    extraCost: 0,
    note: "بدون بطاريات، بدون كهرباء",
  },
  {
    id: "solar-grid",
    name: "شمسي + كهرباء ليلاً (24h)",
    icon: Zap,
    color: "text-blue-400",
    profitDay: 0.55 + (NIGHT_PROFIT_GROSS - NIGHT_COST_USD),
    extraCost: 0,
    note: `كهرباء ليلاً ~${NIGHT_COST_MAD.toFixed(1)} MAD/يوم`,
  },
  {
    id: "solar-battery",
    name: "شمسي + بطاريات (24h)",
    icon: Battery,
    color: "text-green-400",
    profitDay: 1.65,
    extraCost: BATTERY_COST,
    note: `+${BATTERY_COST.toLocaleString()} MAD لبطارية Lithium`,
  },
];

const SCENARIOS = [
  { name: "متشائم", multiplier: 0.55, color: "text-red-400", icon: "📉" },
  { name: "واقعي", multiplier: 1, color: "text-yellow-400", icon: "📊" },
  { name: "متفائل", multiplier: 1.45, color: "text-green-400", icon: "📈" },
  { name: "Bull Run x3", multiplier: 3, color: "text-green-500", icon: "🚀" },
];

export default function CalculatorPage() {
  const bestSetup = [...SETUPS].sort((a, b) => {
    const aROI = (INITIAL_INVESTMENT + a.extraCost) / USD_TO_MAD / a.profitDay;
    const bROI = (INITIAL_INVESTMENT + b.extraCost) / USD_TO_MAD / b.profitDay;
    return aROI - bROI;
  })[0];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">دراسة الجدوى 🧮</h1>
        <p className="text-sm text-slate-400 mt-1">
          مقارنة 3 إعدادات × 4 سيناريوهات لـ 1× RTX 3070
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="رأس المال الأساسي" value={`${INITIAL_INVESTMENT.toLocaleString()} MAD`} subValue="GPU + Mobo + PSU" iconName="dollar" status="neutral" />
        <StatCard label="عدد الـ GPUs" value="1" subValue="RTX 3070" iconName="check" status="good" />
        <StatCard label="استهلاك GPU" value="125W" subValue="بعد Undervolt" iconName="plug" status="neutral" />
        <StatCard label="سعر الكهرباء" value={`${ELECTRICITY_COST_PER_KWH_MAD} MAD`} subValue="لكل kWh (تقديري)" iconName="zap" status="neutral" />
      </section>

      <Card className="bg-green-500/5 border-green-500/30 mb-6">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Trophy className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-green-400 mb-1">
                💡 الإعداد الأفضل: {bestSetup.name}
              </h3>
              <p className="text-sm text-slate-300">
                ربح يومي: <span className="font-bold text-white">${bestSetup.profitDay.toFixed(2)}</span>
                {" • "}
                استرداد: <span className="font-bold text-white">
                  {Math.ceil((INITIAL_INVESTMENT + bestSetup.extraCost) / USD_TO_MAD / bestSetup.profitDay / 30)} شهر
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <h2 className="text-xl font-bold text-white mb-4">📊 مقارنة الإعدادات</h2>
      <div className="grid gap-4 lg:grid-cols-3 mb-8">
        {SETUPS.map((setup) => {
          const Icon = setup.icon;
          const totalCost = INITIAL_INVESTMENT + setup.extraCost;
          const monthly = setup.profitDay * 30;
          const yearly = setup.profitDay * 365;
          const breakEvenMonths = Math.ceil(totalCost / USD_TO_MAD / setup.profitDay / 30);
          const isBest = setup.id === bestSetup.id;

          return (
            <Card key={setup.id} className={`bg-slate-900/60 ${isBest ? "border-green-500/40" : "border-slate-800"}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-slate-800 ${setup.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`text-base font-bold ${setup.color}`}>{setup.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{setup.note}</p>
                    </div>
                  </div>
                  {isBest && <Badge variant="default" className="text-xs">الأفضل</Badge>}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between p-2 rounded bg-slate-800/50">
                    <span className="text-xs text-slate-400">يومياً</span>
                    <span className={`text-sm font-bold ${setup.color}`}>${setup.profitDay.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-slate-800/50">
                    <span className="text-xs text-slate-400">شهرياً</span>
                    <span className="text-sm font-bold text-white">${monthly.toFixed(0)} ({(monthly * USD_TO_MAD).toFixed(0)} MAD)</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-slate-800/50">
                    <span className="text-xs text-slate-400">سنوياً</span>
                    <span className="text-sm font-bold text-white">${yearly.toFixed(0)} ({(yearly * USD_TO_MAD).toFixed(0)} MAD)</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-slate-800/50">
                    <span className="text-xs text-slate-400">رأس المال</span>
                    <span className="text-sm font-bold text-white">{totalCost.toLocaleString()} MAD</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-yellow-500/5 border border-yellow-500/20">
                    <span className="text-xs text-yellow-400">⏱️ الاسترداد</span>
                    <span className={`text-sm font-bold ${setup.color}`}>{breakEvenMonths} شهر</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <h2 className="text-xl font-bold text-white mb-4">📈 سيناريوهات السوق (للإعداد الأفضل)</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SCENARIOS.map((s) => {
          const profitDay = bestSetup.profitDay * s.multiplier;
          const monthly = profitDay * 30;
          const yearly = profitDay * 365;
          const breakEvenMonths = Math.ceil((INITIAL_INVESTMENT + bestSetup.extraCost) / USD_TO_MAD / profitDay / 30);

          return (
            <Card key={s.name} className="bg-slate-900/60 border-slate-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{s.icon}</span>
                  <h3 className={`text-sm font-bold ${s.color}`}>{s.name}</h3>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">يومي</span>
                    <span className={`font-bold ${s.color}`}>${profitDay.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">شهري</span>
                    <span className="text-white">${monthly.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">سنوي</span>
                    <span className="text-white">${yearly.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-700">
                    <span className="text-yellow-400">استرداد</span>
                    <span className={`font-bold ${s.color}`}>{breakEvenMonths} شهر</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-blue-500/5 border-blue-500/30 mt-6">
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-white mb-2">💡 توصية ذكية يا Gojo</h3>
          <div className="text-sm text-slate-300 leading-relaxed space-y-2">
            <p>
              ✅ <strong>ابدأ بالإعداد الأول (شمسي فقط 8h)</strong> باش تختبر بدون مخاطرة عالية.
            </p>
            <p>
              📈 ملي ترجع راس المال (~40 شهر فالواقعي)، فكر فالتوسع بـ:
            </p>
            <ul className="list-disc list-inside mr-4 space-y-1 text-slate-400">
              <li>إضافة GPU ثاني (يضاعف الربح)</li>
              <li>أو شراء بطارية ليتيوم (تشغيل 24h)</li>
              <li>أو تشغيل ليلاً بكهرباء STEG (إذا كان مربح فبلاصتك)</li>
            </ul>
            <p className="text-yellow-400 mt-3">
              ⚠️ هذه تقديرات. الواقع كيتأثر بـ: صعوبة الشبكة، أسعار العملات، ساعات الشمس، الصيانة.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}