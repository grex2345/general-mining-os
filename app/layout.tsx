"use client";

import "./globals.css";
import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { DemoProvider } from "@/components/providers/demo-provider";
import { NotificationsProvider } from "@/components/providers/notifications-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { AlertsSimulator } from "@/components/AlertsSimulator";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <html lang="ar" dir="rtl" className="dark">
      <head>
        <title>General Mining OS</title>
        <meta name="description" content="نظام إدارة مزرعة التعدين الذكية" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#0f172a" />
      </head>
      <body className="bg-slate-950 dark:bg-slate-950 light:bg-slate-50 text-white dark:text-white light:text-slate-900 antialiased transition-colors">
        <ThemeProvider>
          <DemoProvider>
            <NotificationsProvider>
              <OnboardingWizard />
              <AlertsSimulator />
              <div className="flex min-h-screen">
                <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
                <div className="flex-1 flex flex-col min-w-0">
                  <Header onMenuClick={() => setSidebarOpen(true)} />
                  <DemoBanner />
                  <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
                    {children}
                  </main>
                </div>
              </div>
            </NotificationsProvider>
          </DemoProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}