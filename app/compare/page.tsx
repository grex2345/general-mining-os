import StatCard from "@/components/cards/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const PARTS = [
  { name: "RTX 3070 (مستعمل)", morocco: 3400, china: 2800, shipping: 600, customs: 350 },
  { name: "Motherboard + CPU + RAM", morocco: 1800, china: 1400, shipping: 200, customs: 150 },
  { name: "PSU 1000W Gold", morocco: 750, china: 550, shipping: 150, customs: 80 },
  { name: "Riser V009s (×6)", morocco: 800, china: 350, shipping: 100, customs: 50 },
  { name: "Frame معدني", morocco: 200, china: 400, shipping: 250, customs: 60 },
  { name: "Inverter 3KW", morocco: 3200, china: 2400, shipping: 500, customs: 300 },
];

export default function ComparePage() {
  const totalMorocco = PARTS.reduce((s, p) => s + p.morocco, 0);
  const totalChina = PARTS.reduce((s, p) => s + p.china + p.shipping + p.customs, 0);
  const savings = totalMorocco - totalChina;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">مقارنة الأسعار ⚖️</h1>
        <p className="text-sm text-slate-400 mt-1">
          درب غلف vs الصين (مع الشحن والجمارك)
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="إجمالي المغرب" value={`${totalMorocco.toLocaleString()} MAD`} subValue="درب غلف" iconName="dollar" status="neutral" />
        <StatCard label="إجمالي الصين" value={`${totalChina.toLocaleString()} MAD`} subValue="مع شحن وجمارك" iconName="dollar" status="neutral" />
        <StatCard label={savings > 0 ? "توفير" : "خسارة"} value={`${Math.abs(savings).toLocaleString()} MAD`} subValue={savings > 0 ? "بالشراء من الصين" : "بالشراء محلياً"} iconName="target" status={savings > 0 ? "good" : "warning"} />
      </section>

      <div className="space-y-3 mb-6">
        {PARTS.map((p) => {
          const chinaTotalMad = p.china + p.shipping + p.customs;
          const diff = p.morocco - chinaTotalMad;
          const moroccoBetter = diff < 0;

          return (
            <Card key={p.name} className="bg-slate-900/60 border-slate-800">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="text-base font-bold text-white">{p.name}</h3>
                  <Badge variant={moroccoBetter ? "default" : "secondary"} className="text-xs">
                    {moroccoBetter ? "🇲🇦 محلي أرخص" : "🇨🇳 الصين أرخص"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-lg ${moroccoBetter ? "bg-green-500/10 border border-green-500/30" : "bg-slate-800/50"}`}>
                    <p className="text-xs text-slate-400 mb-1">🇲🇦 درب غلف</p>
                    <p className="text-lg font-bold text-white">{p.morocco.toLocaleString()} MAD</p>
                    <p className="text-xs text-slate-500 mt-1">شامل كل شيء</p>
                  </div>

                  <div className={`p-3 rounded-lg ${!moroccoBetter ? "bg-green-500/10 border border-green-500/30" : "bg-slate-800/50"}`}>
                    <p className="text-xs text-slate-400 mb-1">🇨🇳 الصين</p>
                    <p className="text-lg font-bold text-white">{chinaTotalMad.toLocaleString()} MAD</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {p.china} + {p.shipping}شحن + {p.customs}جمارك
                    </p>
                  </div>
                </div>

                <div className="mt-3 p-2 rounded bg-slate-800/30 text-center">
                  <p className="text-xs text-slate-400">
                    الفرق: <span className={`font-bold ${moroccoBetter ? "text-green-400" : "text-yellow-400"}`}>
                      {Math.abs(diff).toLocaleString()} MAD
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-blue-500/5 border-blue-500/30">
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-white mb-3">💡 توصية ذكية</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <span>اشري <strong>GPU + Mobo + PSU</strong> من المغرب (ضمان + سرعة)</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <span>اشري <strong>Risers + إكسسوارات</strong> من الصين (فرق كبير)</span>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <span>الجمارك تختلف: قدّر +20% احتياطاً</span>
            </div>
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <span>تجنّب شراء GPU مستعمل من الصين بدون ضمان</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}