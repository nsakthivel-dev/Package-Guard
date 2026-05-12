import { Link, useLocation } from "wouter";
import { LayoutDashboard, Server, Package, Camera, History, Settings, Shield, ShieldOff, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/environments", label: "Environments", icon: Server },
  { href: "/packages", label: "Packages", icon: Package },
  { href: "/snapshots", label: "Snapshots", icon: Camera },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();

  const toggleSafeMode = () => {
    if (!settings) return;
    updateSettings.mutate(
      { data: { safeMode: !settings.safeMode } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() }) }
    );
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const safeMode = settings?.safeMode ?? true;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">PackageGuard</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5" data-testid="sidebar-nav">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href !== "/" && location.startsWith(href));
            return (
              <Link key={href} href={href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  data-testid={`nav-${label.toLowerCase()}`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
          <button
            onClick={toggleSafeMode}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors",
              safeMode
                ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
            )}
            data-testid="safe-mode-toggle"
          >
            {safeMode ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
            Safe Mode {safeMode ? "ON" : "OFF"}
          </button>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            data-testid="theme-toggle"
          >
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto" data-testid="main-content">
        {children}
      </main>
    </div>
  );
}
