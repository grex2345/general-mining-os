"use client";

import "./globals.css";
import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { DemoProvider } from "@/components/providers/demo-provider";
import { NotificationsProvider } from "@/components/providers/notifications-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SettingsProvider } from "@/components/providers/settings-provider";
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
        <meta name="theme-color" content="#10b981" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Mining OS" />
      </head>
      <body className="bg-slate-950 text-white antialiased">
        <ThemeProvider>
          <SettingsProvider>
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
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}