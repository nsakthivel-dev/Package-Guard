import React from "react";
import { Link, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePackageStore } from "@/store/usePackageStore";
import { TitleBar } from "./TitleBar";

const navItems = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/environments", label: "Environments", icon: "layers" },
  { href: "/packages", label: "Packages", icon: "inventory_2" },
  { href: "/snapshots", label: "Snapshots", icon: "photo_camera" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const statusLabel = {
  'idle': null,
  'scanning-envs': 'Scanning environments...',
  'scanning-packages': 'Scanning packages...',
  'checking-versions': 'Checking latest versions...'
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const { scanStatus, lastScanned } = usePackageStore();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const currentPageLabel = navItems.find(item => 
    location === item.href || (item.href !== "/" && location.startsWith(item.href))
  )?.label || "Dashboard";

  return (
    <div className="flex flex-col min-h-screen bg-surface text-on-surface font-body-sm selection:bg-secondary-container">
      <div className="fixed top-0 left-0 right-0 z-[100] shadow-sm">
        <TitleBar />
        
        {/* TopNavBar Component */}
        <nav className="h-20 bg-secondary dark:bg-on-secondary-fixed border-b border-outline-variant dark:border-outline flex items-center px-margin-desktop transition-colors duration-300">
          <div className="flex items-center gap-10 w-full max-w-container-max mx-auto">
            {/* Logo */}
            <div className="flex items-center gap-3 shrink-0 group cursor-pointer">
              <div className="w-9 h-9 bg-primary-fixed rounded flex items-center justify-center shadow-lg shadow-primary/10 transition-transform group-hover:scale-105">
                <span className="material-symbols-outlined text-on-primary-fixed" style={{ fontVariationSettings: "'FILL' 1" }}>security</span>
              </div>
              <div className="hidden md:block">
                <h1 className="font-title-md text-title-md font-bold text-on-secondary dark:text-on-secondary-fixed leading-tight">PackageGuard</h1>
                <p className="text-[10px] uppercase tracking-widest text-on-secondary/50 font-label-caps">Institutional Security</p>
              </div>
            </div>

            {/* Main Navigation Links */}
            <div className="hidden lg:flex items-center gap-1">
              {navItems.map(({ href, label }) => {
                const active = location === href || (href !== "/" && location.startsWith(href));
                return (
                  <Link key={href} href={href}>
                    <div
                      className={cn(
                        "px-4 py-2 rounded-lg transition-all font-label-caps text-label-caps cursor-pointer",
                        active
                          ? "text-primary-fixed bg-on-secondary-fixed-variant/20 shadow-sm"
                          : "text-on-secondary/70 hover:text-on-secondary hover:bg-on-secondary-fixed-variant/10"
                      )}
                    >
                      {label}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Search and Profile */}
            <div className="flex items-center gap-6 ml-auto">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-secondary/70 cursor-pointer hover:text-on-secondary transition-colors" style={{ fontVariationSettings: "'FILL' 0" }}>notifications</span>
                  <div className="h-6 w-[1px] bg-on-secondary/10"></div>
                  <div 
                    onClick={toggleTheme}
                    className="flex items-center gap-2 cursor-pointer hover:bg-on-secondary-fixed-variant/10 p-1 rounded-lg transition-colors group"
                  >
                    <span className="material-symbols-outlined text-on-secondary/70 group-hover:text-on-secondary">
                      {theme === 'dark' ? 'dark_mode' : 'light_mode'}
                    </span>
                    <span className="material-symbols-outlined text-on-secondary/50 text-sm">expand_more</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Page Header Bar */}
        <header className="bg-surface dark:bg-on-surface border-b border-outline-variant dark:border-outline transition-colors duration-300">
          <div className="max-w-container-max mx-auto px-margin-desktop h-16 flex justify-between items-center">
            <div className="flex items-center gap-6">
              <h2 className="font-headline-lg text-headline-lg font-bold text-primary dark:text-primary-fixed">{currentPageLabel}</h2>
              {(location === "/" || location === "/dashboard/detailed") && (
                <div className="flex gap-4">
                  <Link href="/">
                    <div className={cn(
                      "font-label-caps text-label-caps cursor-pointer pb-1 transition-all",
                      location === "/" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-primary"
                    )}>
                      Global View
                    </div>
                  </Link>
                  <Link href="/dashboard/detailed">
                    <div className={cn(
                      "font-label-caps text-label-caps cursor-pointer pb-1 transition-all",
                      location === "/dashboard/detailed" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-primary"
                    )}>
                      Detailed Analysis
                    </div>
                  </Link>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {scanStatus !== 'idle' && (
                <div className="flex items-center gap-2 text-sm text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full">
                  <Loader2 className="animate-spin w-3.5 h-3.5" />
                  <span className="text-[12px] font-medium">{statusLabel[scanStatus]}</span>
                </div>
              )}
              {scanStatus === 'idle' && lastScanned && (
                <span className="text-[12px] text-on-surface-variant/60 font-medium">
                  Last scan: {formatRelativeTime(lastScanned)}
                </span>
              )}
              <div className="h-8 w-[1px] bg-outline-variant"></div>
              <button className="flex items-center gap-2 py-2 px-4 bg-surface-container hover:bg-surface-container-high rounded-lg text-on-surface-variant font-label-caps text-label-caps transition-all active:scale-95 shadow-sm">
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                Scan Now
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* Main Layout Structure */}
      <div className="flex-1 flex w-full pt-[176px]">
        <main className="flex-1 max-w-container-max mx-auto w-full py-10 px-margin-desktop" id="main-content">
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-surface-container-low border-t border-outline-variant py-8 transition-colors duration-300">
        <div className="max-w-container-max mx-auto px-margin-desktop flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-8">
            <a className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors" href="#">
              <span className="material-symbols-outlined text-[18px]">security</span>
              <span className="font-label-caps text-label-caps">Audit Engine</span>
            </a>
            <button 
              onClick={toggleTheme}
              className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">
                {theme === 'dark' ? 'dark_mode' : 'light_mode'}
              </span>
              <span className="font-label-caps text-label-caps">Theme Settings</span>
            </button>
            <a className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors" href="#">
              <span className="material-symbols-outlined text-[18px]">help</span>
              <span className="font-label-caps text-label-caps">Documentation</span>
            </a>
          </div>
          <p className="text-on-surface-variant/50 text-[12px] font-label-caps">© 2024 PackageGuard Institutional Security. Version 2.4.0-stable</p>
        </div>
      </footer>
    </div>
  );
}
