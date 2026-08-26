import React from "react";
import { Link, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePackageStore } from "@/store/usePackageStore";
import { TitleBar } from "./TitleBar";
import { runAutoScan } from "@/lib/autoScan";

const navGroups = [
  {
    label: "GENERAL",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/environments", label: "Environments", icon: "layers" },
      { href: "/packages", label: "Packages", icon: "inventory_2" },
    ],
  },
  {
    label: "MONITORING",
    items: [
      { href: "/snapshots", label: "Snapshots", icon: "photo_camera" },
      { href: "/history", label: "History", icon: "history" },
    ],
  },
  {
    label: "SUPPORT",
    items: [
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

const statusLabel = {
  'idle': null,
  'scanning-envs': 'Scanning environments...',
  'scanning-packages': 'Scanning packages...',
  'checking-versions': 'Checking latest versions...'
};

function NavItem({ 
  href, 
  label, 
  icon, 
  active 
}: { 
  href: string; 
  label: string; 
  icon: string; 
  active: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-medium transition-all cursor-pointer",
          active
            ? "bg-white/10 text-white"
            : "text-sidebar-foreground hover:bg-white/5 hover:text-white/90"
        )}
      >
        <span className={cn("material-symbols-outlined text-[20px] shrink-0", active && "active-icon")}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const qc = useQueryClient();
  const { data: settings } = useGetSettings();
  const { scanStatus, lastScanned } = usePackageStore();

  const currentPageLabel = (() => {
    for (const group of navGroups) {
      const found = group.items.find(item => 
        location === item.href || (item.href !== "/" && location.startsWith(item.href))
      );
      if (found) return found.label;
    }
    return "Dashboard";
  })();

  const handleScan = () => {
    runAutoScan({ force: true });
  };

  return (
    <div className="flex min-h-screen bg-background text-on-surface font-sans">
      {/* Electron Drag Region */}
      <div className="electron-drag-region" />

      {/* Title Bar (for Electron) */}
      <div className="fixed top-0 left-0 right-0 z-[100]">
        <TitleBar />
      </div>

      {/* Left Sidebar */}
      <aside className="w-[240px] shrink-0 h-screen sticky top-0 pt-8 sidebar-glass flex flex-col">
        {/* Logo Area */}
        <div className="px-5 py-5 mb-2">
          <div className="flex items-center gap-3 cursor-pointer group">
            <div className="w-8 h-8 rounded-lg bg-[#4F46E5] flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
              <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                security
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold text-white leading-tight">PackageGuard</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-6">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                  {group.label}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon }) => {
                  const active = location === href || (href !== "/" && location.startsWith(href));
                  return (
                    <NavItem
                      key={href}
                      href={href}
                      label={label}
                      icon={icon}
                      active={active}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Account Area */}
        <div className="px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[16px] text-white/70">
                shield_person
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-white truncate">PackageGuard</p>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">v2.4.0</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pt-8">
        {/* Top Bar */}
        <header className="sticky top-8 z-40 bg-surface-container-lowest border-b border-card-border h-16 flex items-center px-8 shrink-0">
          {/* Left: Page Title + Sub-nav */}
          <div className="flex items-center gap-6 min-w-0">
            <h1 className="text-[20px] font-semibold text-on-surface leading-none truncate">
              {currentPageLabel}
            </h1>
            {(location === "/" || location === "/dashboard/detailed") && (
              <div className="flex gap-1">
                <Link href="/">
                  <div className={cn(
                    "px-3 py-1.5 rounded-md text-[13px] font-medium cursor-pointer transition-all",
                    location === "/" 
                      ? "bg-muted text-on-surface" 
                      : "text-muted-foreground hover:text-on-surface hover:bg-muted/50"
                  )}>
                    Global View
                  </div>
                </Link>
                <Link href="/dashboard/detailed">
                  <div className={cn(
                    "px-3 py-1.5 rounded-md text-[13px] font-medium cursor-pointer transition-all",
                    location === "/dashboard/detailed" 
                      ? "bg-muted text-on-surface" 
                      : "text-muted-foreground hover:text-on-surface hover:bg-muted/50"
                  )}>
                    Detailed Analysis
                  </div>
                </Link>
              </div>
            )}
          </div>

          {/* Right: Search, Notifications, Scan Now */}
          <div className="flex items-center gap-3 ml-auto shrink-0">
            {/* Scan Status */}
            {scanStatus !== 'idle' && (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                <Loader2 className="animate-spin w-3.5 h-3.5" />
                <span className="font-medium">{statusLabel[scanStatus]}</span>
              </div>
            )}
            {scanStatus === 'idle' && lastScanned && (
              <span className="text-[12px] text-muted-foreground font-medium hidden md:block">
                Last scan: {formatRelativeTime(lastScanned)}
              </span>
            )}

            {/* Search */}
            <div className="relative hidden md:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[18px]">
                search
              </span>
              <input
                type="search"
                placeholder="Search..."
                className="w-[200px] h-9 pl-9 pr-4 rounded-lg border border-card-border bg-surface-container-lowest text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
            </div>

            {/* Notifications Bell */}
            <button className="relative w-9 h-9 rounded-lg border border-card-border bg-surface-container-lowest flex items-center justify-center text-muted-foreground hover:text-on-surface hover:bg-muted transition-all">
              <span className="material-symbols-outlined text-[18px]">
                notifications
              </span>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary"></span>
            </button>

            {/* Scan Now Primary Button */}
            <button
              onClick={handleScan}
              disabled={scanStatus !== 'idle'}
              className="flex items-center gap-2 px-4 h-9 rounded-lg primary-btn-solid text-[13px] font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px]">
                {scanStatus !== 'idle' ? 'progress_activity' : 'refresh'}
              </span>
              Scan Now
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 overflow-y-auto animate-in fade-in duration-300">
          {children}
        </main>
      </div>
    </div>
  );
}
