import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Bot, Pickaxe, AlertTriangle } from "lucide-react";

export default function AIComparisonPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">AI Compute vs Mining 🤖</h1>
        <p className="text-sm text-slate-400 mt-1">
          مقارنة فقط — بدون تنفيذ تلقائي
        </p>
      </div>

      <Card className="bg-yellow-500/5 border-yellow-500/30 mb-6">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-yellow-400 mb-1">Read-only — Future Optional</p>
              <p className="text-xs text-slate-300">
                هذه الميزة معطلة افتراضياً. التطبيق لا ينفذ أي تبديل تلقائي.
                للمعلومات فقط حتى يكون عندك Setup مناسب.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card className="bg-slate-900/60 border-green-500/40">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Pickaxe className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-green-400">⛏️ Mining</h3>
                <p className="text-xs text-slate-400">التعدين التقليدي</p>
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between p-2 rounded bg-slate-800/50">
                <span className="text-slate-400">الربح/يوم</span>
                <span className="font-bold text-green-400">$0.55 - $1.65</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-800/50">
                <span className="text-slate-400">الصعوبة</span>
                <Badge variant="default" className="text-xs">🟢 سهل</Badge>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-800/50">
                <span className="text-slate-400">الإنترنت</span>
                <Badge variant="default" className="text-xs">🟢 4G كافي</Badge>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-800/50">
                <span className="text-slate-400">الاستقرار</span>
                <Badge variant="default" className="text-xs">🟢 مرن</Badge>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-800/50">
                <span className="text-slate-400">الإعداد</span>
                <Badge variant="default" className="text-xs">🟢 HiveOS</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-red-500/40">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Bot className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-400">🤖 AI Rental</h3>
                <p className="text-xs text-slate-400">تأجير GPU (Vast.ai/Render)</p>
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between p-2 rounded bg-slate-800/50">
                <span className="text-slate-400">الربح/يوم</span>
                <span className="font-bold text-yellow-400">~$1.20 (تقديري)</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-800/50">
                <span className="text-slate-400">الصعوبة</span>
                <Badge variant="destructive" className="text-xs">🔴 عالية</Badge>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-800/50">
                <span className="text-slate-400">الإنترنت</span>
                <Badge variant="destructive" className="text-xs">🔴 Fiber لازم</Badge>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-800/50">
                <span className="text-slate-400">الاستقرار</span>
                <Badge variant="destructive" className="text-xs">🔴 24/7 إجباري</Badge>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-800/50">
                <span className="text-slate-400">الإعداد</span>
                <Badge variant="destructive" className="text-xs">🔴 Docker + KYC</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-green-500/5 border-green-500/30">
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-white mb-3">💡 التوصية الحالية</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <span className="text-slate-300">
                <strong className="text-green-400">⛏️ Mine Now</strong> — Setup ديالك مناسب 100% للتعدين
              </span>
            </div>
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-slate-300">
                <strong className="text-red-400">🤖 AI Rental: Not suitable now</strong> — يحتاج Fiber + 24/7
              </span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <p className="text-xs text-slate-400 leading-relaxed">
              <strong>متى نفكر فـ AI Rental؟</strong>
              <br />
              ✓ ملي يكون عندك Fiber 100Mbps+
              <br />
              ✓ ملي تكون عندك بطاريات (24/7)
              <br />
              ✓ ملي يكون عندك 3+ GPUs قوية (RTX 4090 مثلاً)
              <br />
              ✓ ملي تكون مستعد للـ KYC والإعدادات المعقدة
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}