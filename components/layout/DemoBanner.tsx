"use client"

import { FlaskConical } from "lucide-react"
import { useDemoMode } from "@/components/providers/demo-provider"

export function DemoBanner() {
  const { isReady, onboarding, isDemo } = useDemoMode()

  if (!isReady || !onboarding.completed || !isDemo) return null

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">
      <div className="flex items-center justify-center gap-2">
        <FlaskConical className="h-4 w-4" />
        <span>أنت في وضع تجريبي - البيانات للتعلم فقط</span>
      </div>
    </div>
  )
}