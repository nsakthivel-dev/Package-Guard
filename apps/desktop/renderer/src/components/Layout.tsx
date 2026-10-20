import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, LogOut, User as UserIcon, Settings, ChevronDown, Check, FolderOpen } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useGetSettings } from "@packageguard/api-client-react";
import { usePackageStore } from "@/store/usePackageStore";
import { useAuthStore } from "@/store/useAuthStore";
import { TitleBar } from "./TitleBar";
import { runAutoScan } from "@/lib/autoScan";
import { ProfileStorageDialog } from "./ProfileStorageDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
      { href: "/profile", label: "Profile", icon: "account_circle" },
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
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 outline-none select-none cursor-pointer",
        active
          ? "bg-sidebar-accent text-white shadow-xs font-semibold"
          : "text-sidebar-foreground hover:bg-[#252A38] hover:text-white"
      )}
    >
      <span
        className={cn(
          "material-symbols-outlined text-[19px] shrink-0 transition-colors duration-150",
          active ? "text-white active-icon" : "text-sidebar-foreground/80 group-hover:text-white"
        )}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: settings } = useGetSettings();
  const { scanStatus, lastScanned } = usePackageStore();
  const { user, accounts, switchAccount, logout } = useAuthStore();
  const [showStorageDialog, setShowStorageDialog] = useState(false);

  const displayName = user?.displayName?.trim() || "My Profile";
  const userInitials = displayName.charAt(0).toUpperCase() || "P";

  const currentPageLabel = (() => {
    if (location === "/login") return "Sign In";
    if (location === "/profile") return "Profile";
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

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
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
          <Link href="/" className="flex items-center gap-3 cursor-pointer group">
            <img
              src="./logo.png"
              alt="PackageGuard"
              className="w-8 h-8 rounded-lg object-contain shrink-0 transition-transform group-hover:scale-105"
            />
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold text-white leading-tight">PackageGuard</span>
            </div>
          </Link>
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
              <div className="flex flex-col gap-1">
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
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#252A38] cursor-pointer transition-colors group outline-none text-left"
                  title="Account Menu"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={displayName}
                      className="w-7 h-7 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary font-bold text-[12px] flex items-center justify-center shrink-0">
                      {userInitials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-white truncate group-hover:text-primary transition-colors">
                      {displayName}
                    </p>
                    <p className="text-[10px] text-sidebar-foreground/60 truncate">
                      {user.email}
                    </p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-sidebar-foreground/40 group-hover:text-white transition-colors shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56 bg-surface-container-lowest border border-card-border p-1.5 rounded-xl shadow-xl mb-1">
                <DropdownMenuLabel className="font-normal px-2.5 py-2">
                  <div className="flex flex-col space-y-0.5">
                    <p className="text-[13px] font-semibold text-on-surface truncate">{displayName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-card-border my-1" />
                <DropdownMenuItem
                  onClick={() => setLocation("/profile")}
                  className="cursor-pointer text-[13px] rounded-lg px-2.5 py-2 text-on-surface hover:bg-[#E8E9FF] hover:text-[#4338CA] focus:bg-[#E8E9FF] focus:text-[#4338CA] flex items-center gap-2"
                >
                  <UserIcon className="w-4 h-4 text-primary shrink-0" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowStorageDialog(true)}
                  className="cursor-pointer text-[13px] rounded-lg px-2.5 py-2 text-on-surface hover:bg-[#E8E9FF] hover:text-[#4338CA] focus:bg-[#E8E9FF] focus:text-[#4338CA] flex items-center gap-2"
                >
                  <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>Profile Storage Location</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLocation("/settings")}
                  className="cursor-pointer text-[13px] rounded-lg px-2.5 py-2 text-on-surface hover:bg-[#E8E9FF] hover:text-[#4338CA] focus:bg-[#E8E9FF] focus:text-[#4338CA] flex items-center gap-2"
                >
                  <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-card-border my-1" />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-[13px] rounded-lg px-2.5 py-2 text-destructive hover:bg-destructive/10 focus:bg-destructive/10 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4 text-destructive shrink-0" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div
              onClick={() => setLocation("/login")}
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#252A38] cursor-pointer transition-colors group"
              title="Sign in with Google"
            >
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-white/70 group-hover:text-white group-hover:bg-primary/20 transition-colors">
                <span className="material-symbols-outlined text-[16px]">account_circle</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-white truncate group-hover:text-primary transition-colors">
                  Sign In
                </p>
                <p className="text-[10px] text-sidebar-foreground/60 truncate">
                  Connect Google Account
                </p>
              </div>
            </div>
          )}
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
              <div className="flex items-center gap-1">
                <Link
                  href="/"
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[13px] font-medium cursor-pointer transition-colors block select-none",
                    location === "/" 
                      ? "bg-muted text-on-surface" 
                      : "text-muted-foreground hover:text-on-surface hover:bg-muted/50"
                  )}
                >
                  Global View
                </Link>
                <Link
                  href="/dashboard/detailed"
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[13px] font-medium cursor-pointer transition-colors block select-none",
                    location === "/dashboard/detailed" 
                      ? "bg-muted text-on-surface" 
                      : "text-muted-foreground hover:text-on-surface hover:bg-muted/50"
                  )}
                >
                  Detailed Analysis
                </Link>
              </div>
            )}
          </div>

          {/* Right: Scan Status, Scan Now, User Authentication Controls */}
          <div className="flex items-center gap-3 ml-auto shrink-0">
            {/* Scan Status */}
            {scanStatus !== 'idle' && (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                <Loader2 className="animate-spin w-3.5 h-3.5" />
                <span className="font-medium">{statusLabel[scanStatus]}</span>
              </div>
            )}
            {scanStatus === 'idle' && lastScanned && (settings as any)?.backgroundPermission === true && (
              <span className="text-[12px] text-muted-foreground font-medium hidden md:block">
                Last scan: {formatRelativeTime(lastScanned)}
              </span>
            )}

            {/* Scan Now Primary Button */}
            <button
              onClick={handleScan}
              disabled={scanStatus !== 'idle'}
              className="flex items-center gap-2 px-4 h-9 rounded-lg primary-btn-solid text-[13px] font-medium disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">
                {scanStatus !== 'idle' ? 'progress_activity' : 'refresh'}
              </span>
              Scan Now
            </button>

            {/* Divider */}
            <div className="h-6 w-[1px] bg-card-border" />

            {/* User Account / Profile Button */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl hover:bg-slate-100 border border-slate-200/90 cursor-pointer transition-colors outline-none group bg-white shadow-xs">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={displayName}
                        className="w-7 h-7 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary font-bold text-[12px] flex items-center justify-center shrink-0">
                        {userInitials}
                      </div>
                    )}
                    <span className="text-[13px] font-medium text-slate-800 max-w-[120px] truncate hidden sm:inline">
                      {displayName}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 bg-white border border-slate-200 p-1.5 rounded-xl shadow-xl">
                  <DropdownMenuLabel className="font-normal px-2.5 py-2">
                    <div className="flex flex-col space-y-0.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-semibold text-slate-900 truncate">{displayName}</p>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">Active</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-slate-100 my-1" />

                  {/* Connected Accounts Quick-Switch */}
                  {accounts && accounts.filter(a => a.id !== user.id).length > 0 && (
                    <>
                      <div className="px-2.5 py-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Switch Account
                        </span>
                      </div>
                      {accounts.filter(a => a.id !== user.id).map(acc => (
                        <DropdownMenuItem
                          key={acc.id}
                          onClick={() => switchAccount(acc.id)}
                          className="cursor-pointer text-[12.5px] rounded-lg px-2.5 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2"
                        >
                          <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                            {(acc.displayName || "G").charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{acc.displayName || "Google Account"}</p>
                            <p className="text-[10.5px] text-slate-400 truncate">{acc.email}</p>
                          </div>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator className="bg-slate-100 my-1" />
                    </>
                  )}

                  <DropdownMenuItem
                    onClick={() => setLocation("/profile")}
                    className="cursor-pointer text-[13px] rounded-lg px-2.5 py-2 text-on-surface hover:bg-surface-container focus:bg-surface-container flex items-center gap-2"
                  >
                    <UserIcon className="w-4 h-4 text-primary shrink-0" />
                    <span>My Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setLocation("/login")}
                    className="cursor-pointer text-[13px] rounded-lg px-2.5 py-2 text-on-surface hover:bg-surface-container focus:bg-surface-container flex items-center gap-2"
                  >
                    <UserIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>Add Google Account</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setShowStorageDialog(true)}
                    className="cursor-pointer text-[13px] rounded-lg px-2.5 py-2 text-on-surface hover:bg-surface-container focus:bg-surface-container flex items-center gap-2"
                  >
                    <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>Profile Storage Location</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setLocation("/settings")}
                    className="cursor-pointer text-[13px] rounded-lg px-2.5 py-2 text-on-surface hover:bg-surface-container focus:bg-surface-container flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-card-border my-1" />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer text-[13px] rounded-lg px-2.5 py-2 text-destructive hover:bg-destructive/10 focus:bg-destructive/10 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4 text-destructive shrink-0" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                onClick={() => setLocation("/login")}
                className="flex items-center gap-2 px-3.5 h-9 rounded-lg border border-card-border hover:bg-surface-container text-[13px] font-medium text-on-surface bg-surface-container-lowest shadow-xs cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[17px] text-primary">login</span>
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 overflow-y-auto animate-in fade-in duration-300">
          {children}
        </main>
      </div>

      {/* Global Profile Storage Location Dialog */}
      <ProfileStorageDialog open={showStorageDialog} onOpenChange={setShowStorageDialog} />
    </div>
  );
}
