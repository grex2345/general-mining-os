"use client"

import { useState } from "react"
import { Cpu, GraduationCap, Rocket, MonitorSmartphone } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useDemoMode } from "@/components/providers/demo-provider"

export function OnboardingWizard() {
  const { onboarding, isReady, completeOnboarding } = useDemoMode()
  const [step, setStep] = useState(1)
  const [hasRig, setHasRig] = useState<boolean | null>(null)
  const [gpuType, setGpuType] = useState("RTX 3070")
  const [gpuCount, setGpuCount] = useState(1)

  if (!isReady || onboarding.completed) return null

  const handleNoRig = () => {
    completeOnboarding({
      hasRig: false,
      mode: "demo",
      gpuType: "",
      gpuCount: 0,
    })
  }

  const handleHasRigNext = () => {
    setHasRig(true)
    setStep(2)
  }

  const handleFinishLive = () => {
    completeOnboarding({
      hasRig: true,
      mode: "live",
      gpuType,
      gpuCount,
    })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-2xl border-white/10 bg-zinc-950 text-white shadow-2xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
            <Rocket className="h-8 w-8 text-emerald-400" />
          </div>
          <CardTitle className="text-2xl md:text-3xl">
            مرحباً بك في General Mining OS 👑
          </CardTitle>
          <p className="text-sm text-zinc-400 md:text-base">
            خلّينا نجهز النظام حسب وضعك الحالي، سواء كنت تبدأ من الصفر أو عندك مزرعة جاهزة.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {step === 1 && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <button
                  onClick={handleNoRig}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-right transition hover:border-emerald-500 hover:bg-zinc-800"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <GraduationCap className="h-6 w-6 text-emerald-400" />
                    <h3 className="text-lg font-bold">أريد أتعلم أولاً</h3>
                  </div>
                  <p className="text-sm text-zinc-400">
                    ادخل وضع تجريبي ببيانات واقعية للتعلم بدون الحاجة إلى HiveOS أو أجهزة حقيقية.
                  </p>
                </button>

                <button
                  onClick={handleHasRigNext}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-right transition hover:border-blue-500 hover:bg-zinc-800"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <Cpu className="h-6 w-6 text-blue-400" />
                    <h3 className="text-lg font-bold">عندي جهاز تعدين</h3>
                  </div>
                  <p className="text-sm text-zinc-400">
                    سنجهز النظام على الوضع الحقيقي مع معلومات الـ GPU وعدد الأجهزة.
                  </p>
                </button>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
                💡 إذا اخترت وضع التعلم، ستتمكن من تجربة كل خصائص النظام ببيانات محاكاة.
              </div>
            </>
          )}

          {step === 2 && hasRig && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <MonitorSmartphone className="h-5 w-5 text-blue-400" />
                <h3 className="text-lg font-bold">إعداد العتاد الأساسي</h3>
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300">نوع الـ GPU</label>
                  <select
                    value={gpuType}
                    onChange={(e) => setGpuType(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                  >
                    <option value="RTX 3070">RTX 3070</option>
                    <option value="RTX 3060 Ti">RTX 3060 Ti</option>
                    <option value="RTX 3080">RTX 3080</option>
                    <option value="RX 6700 XT">RX 6700 XT</option>
                    <option value="RX 6800">RX 6800</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-zinc-300">عدد الكروت</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={gpuCount}
                    onChange={(e) => setGpuCount(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  رجوع
                </Button>
                <Button onClick={handleFinishLive}>
                  دخول الوضع الحقيقي 🚀
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}