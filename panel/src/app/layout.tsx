import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { signedIn } from "@/lib/session";
import { maybe } from "@/lib/api";
import type { System } from "@/lib/types";
import { AppSidebar } from "@/components/AppSidebar";
import { SignIn } from "@/components/SignIn";
import { RouteProgress } from "@/components/RouteProgress";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Reel",
  description: "Downloader",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authenticated = await signedIn();
  const system = authenticated ? await maybe<System>("/api/system") : null;

  return (
    <html lang="en" className={cn("font-sans", geist.variable, geistMono.variable)} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          <TooltipProvider delayDuration={200}>
            {!authenticated ? (
              <SignIn />
            ) : (
              <SidebarProvider>
                <AppSidebar running={system?.running ?? 0} />
                <SidebarInset>
                  <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger />
                    <Separator orientation="vertical" className="h-4" />
                    <div className="flex-1" />
                    <ThemeToggle />
                  </header>
                  <main className="flex-1 p-6 md:p-8">
                    <div className="mx-auto w-full max-w-5xl">{children}</div>
                  </main>
                </SidebarInset>
              </SidebarProvider>
            )}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
