"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

type AppMode = "demo" | "live"

type OnboardingData = {
  completed: boolean
  mode: AppMode
  hasRig: boolean | null
  gpuType: string
  gpuCount: number
}

type DemoContextType = {
  onboarding: OnboardingData
  isReady: boolean
  isDemo: boolean
  isLive: boolean
  completeOnboarding: (data: Partial<OnboardingData>) => void
  switchMode: (mode: AppMode) => void
  resetOnboarding: () => void
}

const STORAGE_KEY = "general-mining-os-onboarding"

const defaultOnboarding: OnboardingData = {
  completed: false,
  mode: "demo",
  hasRig: null,
  gpuType: "",
  gpuCount: 1,
}

const DemoContext = createContext<DemoContextType | undefined>(undefined)

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [onboarding, setOnboarding] = useState<OnboardingData>(defaultOnboarding)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setOnboarding({ ...defaultOnboarding, ...parsed })
      }
    } catch (error) {
      console.error("Failed to load onboarding data:", error)
    } finally {
      setIsReady(true)
    }
  }, [])

  const saveData = (data: OnboardingData) => {
    setOnboarding(data)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  const completeOnboarding = (data: Partial<OnboardingData>) => {
    const updated: OnboardingData = {
      ...onboarding,
      ...data,
      completed: true,
    }
    saveData(updated)
  }

  const switchMode = (mode: AppMode) => {
    const updated: OnboardingData = {
      ...onboarding,
      mode,
    }
    saveData(updated)
  }

  const resetOnboarding = () => {
    localStorage.removeItem(STORAGE_KEY)
    setOnboarding(defaultOnboarding)
  }

  const value = useMemo(
    () => ({
      onboarding,
      isReady,
      isDemo: onboarding.mode === "demo",
      isLive: onboarding.mode === "live",
      completeOnboarding,
      switchMode,
      resetOnboarding,
    }),
    [onboarding, isReady]
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export function useDemoMode() {
  const context = useContext(DemoContext)
  if (!context) {
    throw new Error("useDemoMode must be used within a DemoProvider")
  }
  return context
}