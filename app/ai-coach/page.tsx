"use client";

import { useState, useEffect } from "react";
import {
  Brain,
  TrendingUp,
  Target,
  Zap,
  Award,
  AlertTriangle,
  Lightbulb,
  Clock,
  DollarSign,
  Activity,
} from "lucide-react";

export default function AiCoachPage() {
  const [stats, setStats] = useState<any>(null);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/decisions").then((r) => r.json()),
    ]).then(([decisionsData]) => {
      setDecisions(decisionsData);
      
      // 🧠 تحليل ذكي للقرارات
      const totalDecisions = decisionsData.length;
      const switchDecisions = decisionsData.filter((d: any) => d.action === 'switch').length;
      const stayDecisions = decisionsData.filter((d: any) => d.action === 'stay').length;
      const avgScore = decisionsData.reduce((sum: number, d: any) => sum + d.score, 0) / totalDecisions || 0;
      const highRisk = decisionsData.filter((d: any) => d.risk === 'high').length;
      
      // تحليل ساعات النشاط
      const hourCounts: Record<number, number> = {};
      decisionsData.forEach((d: any) => {
        const hour = new Date(d.timestamp).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });
      const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      // العملات المفضلة
      const coinCounts: Record<string, number> = {};
      decisionsData.forEach((d: any) => {
        coinCounts[d.coin] = (coinCounts[d.coin] || 0) + 1;
      });
      const favoriteCoin = Object.entries(coinCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      // تحديد الشخصية
      const switchRate = (switchDecisions / totalDecisions) * 100;
      let personality = "Balanced";
      let personalityEmoji = "⚖️";
      if (switchRate > 60) {
        personality = "Aggressive";
        personalityEmoji = "🔥";
      } else if (switchRate < 30) {
        personality = "Conservative";
        personalityEmoji = "🛡️";
      }

      setStats({
        totalDecisions,
        switchDecisions,
        stayDecisions,
        avgScore: avgScore.toFixed(1),
        highRisk,
        peakHour,
        favoriteCoin,
        personality,
        personalityEmoji,
        switchRate: switchRate.toFixed(0),
      });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-zinc-400">⏳ جاري تحليل بياناتك...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 🎯 Header */}
      <div className="flex items-start gap-4">
        <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 p-4 rounded-2xl border border-purple-500/30">
          <Brain className="w-8 h-8 text-purple-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">المدرب الذكي 🧠</h1>
          <p className="text-zinc-400 text-sm mt-1">
            تحليل ذكي لقراراتك مع نصائح مخصصة لك يا الجنرال
          </p>
        </div>
      </div>

      {/* 🎨 Personality Card (Hero) */}
      <div className="bg-gradient-to-br from-purple-900/50 via-purple-800/30 to-pink-900/50 border border-purple-500/30 rounded-2xl p-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-purple-300 text-sm mb-2">شخصيتك في التعدين</p>
            <h2 className="text-4xl font-bold text-white flex items-center gap-3">
              {stats.personalityEmoji} {stats.personality}
            </h2>
            <p className="text-zinc-300 mt-3 text-sm max-w-md">
              {stats.personality === "Aggressive" && "أنت من النوع الذي يحب المخاطرة والتبديل المستمر. اقرأ النصائح أدناه لتقليل المخاطر!"}
              {stats.personality === "Conservative" && "أنت محافظ وذكي، تفضل الاستقرار. هذا ممتاز للأرباح طويلة المدى!"}
              {stats.personality === "Balanced" && "أنت متوازن في قراراتك، تجمع بين الحذر والمخاطرة المحسوبة. ممتاز!"}
            </p>
          </div>
          <div className="text-center">
            <div className="text-6xl mb-2">{stats.personalityEmoji}</div>
            <div className="text-purple-300 text-sm">معدل التبديل: {stats.switchRate}%</div>
          </div>
        </div>
      </div>

      {/* 📊 Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <InsightCard
          icon={<Brain className="w-5 h-5" />}
          label="إجمالي القرارات"
          value={stats.totalDecisions}
          subValue="قرار محفوظ"
          color="purple"
        />
        <InsightCard
          icon={<Activity className="w-5 h-5" />}
          label="متوسط الثقة"
          value={`${stats.avgScore}/100`}
          subValue={parseFloat(stats.avgScore) > 70 ? "ممتاز 🟢" : parseFloat(stats.avgScore) > 50 ? "جيد 🟡" : "يحتاج تحسين 🔴"}
          color="green"
        />
        <InsightCard
          icon={<Clock className="w-5 h-5" />}
          label="ساعة النشاط الذهبية"
          value={`${stats.peakHour}:00`}
          subValue="أكثر ساعة تأخذ فيها قرارات"
          color="yellow"
        />
        <InsightCard
          icon={<Award className="w-5 h-5" />}
          label="العملة المفضلة"
          value={stats.favoriteCoin}
          subValue="الأكثر ظهوراً في قراراتك"
          color="pink"
        />
      </div>

      {/* 💡 Smart Insights */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-400" />
          نصائح ذكية مخصصة لك
        </h2>

        <InsightTip
          icon={<TrendingUp className="w-5 h-5" />}
          title={`💰 فرصة الأرباح: ${stats.peakHour}:00`}
          description={`لاحظت أنك تأخذ معظم قراراتك في الساعة ${stats.peakHour}:00. هذا الوقت مناسب لمراقبة السوق! استمر.`}
          color="green"
        />

        {stats.highRisk > 0 && (
          <InsightTip
            icon={<AlertTriangle className="w-5 h-5" />}
            title={`⚠️ تحذير: ${stats.highRisk} قرار عالي المخاطر`}
            description={`اتخذت ${stats.highRisk} قرار عالي المخاطر. ربما حان الوقت لتفعيل الوضع الآمن في الإعدادات.`}
            color="red"
          />
        )}

        {parseFloat(stats.avgScore) < 60 && (
          <InsightTip
            icon={<Target className="w-5 h-5" />}
            title="🎯 قراراتك تحتاج تحسين"
            description="متوسط ثقة قراراتك أقل من 60%. حاول الانتظار لقرارات بثقة أعلى من 70% للحصول على نتائج أفضل."
            color="yellow"
          />
        )}

        {stats.switchRate > 60 && (
          <InsightTip
            icon={<Zap className="w-5 h-5" />}
            title="⚡ تبدل بكثرة"
            description={`نسبة تبديلك ${stats.switchRate}% مرتفعة. كل تبديل يعني فقدان وقت تعدين. حاول الانتظار 4-6 ساعات بين التبديلات.`}
            color="orange"
          />
        )}

        {stats.switchRate < 30 && stats.totalDecisions > 5 && (
          <InsightTip
            icon={<Award className="w-5 h-5" />}
            title="🏆 استراتيجية ممتازة!"
            description="قراراتك مدروسة وغير متسرعة. هذا النوع من السلوك يحقق أرباحاً مستقرة على المدى الطويل."
            color="green"
          />
        )}

        <InsightTip
          icon={<DollarSign className="w-5 h-5" />}
          title="💎 توقع الأرباح"
          description={`بناءً على نمطك الحالي، يمكنك تحقيق ربح إضافي بنسبة ${(parseFloat(stats.avgScore) / 10).toFixed(0)}% الشهر القادم إذا اتبعت توصيات المحرك بدقة.`}
          color="purple"
        />
      </div>

      {/* 📜 Recent Decisions */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-400" />
          آخر القرارات (تاريخك)
        </h2>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          {decisions.slice(0, 8).map((decision: any, index: number) => (
            <div
              key={decision.id}
              className={`flex items-center justify-between p-4 ${
                index !== decisions.slice(0, 8).length - 1 ? "border-b border-zinc-800" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    decision.action === "switch"
                      ? "bg-purple-400"
                      : decision.action === "stay"
                      ? "bg-green-400"
                      : "bg-yellow-400"
                  }`}
                />
                <div>
                  <div className="text-sm font-bold text-white">
                    {decision.action === "switch" ? "🔄 تبديل" : decision.action === "stay" ? "✋ ابق" : "⏰ انتظر"}
                    : {decision.coin}
                    {decision.toCoin && ` → ${decision.toCoin}`}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">{decision.reason}</div>
                </div>
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-purple-400">{decision.score}/100</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {new Date(decision.timestamp).toLocaleDateString("ar-MA")}
                </div>
              </div>
            </div>
          ))}
          {decisions.length === 0 && (
            <div className="p-8 text-center text-zinc-500">
              لا توجد قرارات بعد. ابدأ باستخدام التطبيق لترى التحليل!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 📊 Insight Card
function InsightCard({
  icon,
  label,
  value,
  subValue,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color: "purple" | "green" | "yellow" | "pink";
}) {
  const colors = {
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    pink: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-zinc-400">{label}</div>
        <div className={`p-2 rounded-lg border ${colors[color]}`}>{icon}</div>
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      {subValue && <div className="text-xs text-zinc-500">{subValue}</div>}
    </div>
  );
}

// 💡 Insight Tip
function InsightTip({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: "green" | "yellow" | "red" | "orange" | "purple";
}) {
  const colors = {
    green: "from-green-900/30 to-emerald-900/20 border-green-500/30 text-green-400",
    yellow: "from-yellow-900/30 to-amber-900/20 border-yellow-500/30 text-yellow-400",
    red: "from-red-900/30 to-rose-900/20 border-red-500/30 text-red-400",
    orange: "from-orange-900/30 to-red-900/20 border-orange-500/30 text-orange-400",
    purple: "from-purple-900/30 to-pink-900/20 border-purple-500/30 text-purple-400",
  };

  return (
    <div className={`bg-gradient-to-r ${colors[color]} border rounded-xl p-5`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-zinc-900/50 ${colors[color].split(" ").pop()}`}>{icon}</div>
        <div className="flex-1">
          <h3 className="font-bold text-white mb-1">{title}</h3>
          <p className="text-sm text-zinc-300">{description}</p>
        </div>
      </div>
    </div>
  );
}