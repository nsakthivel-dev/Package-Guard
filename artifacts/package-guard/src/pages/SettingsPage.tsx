import { useState, useEffect } from "react";
import { Plus, X, Save } from "lucide-react";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();

  const [safeMode, setSafeMode] = useState(true);
  const [cacheDuration, setCacheDuration] = useState("6");
  const [concurrency, setConcurrency] = useState("5");
  const [autoSnapshot, setAutoSnapshot] = useState(true);
  const [theme, setTheme] = useState("dark");
  const [paths, setPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");

  useEffect(() => {
    if (settings) {
      setSafeMode(settings.safeMode);
      setCacheDuration(String(settings.cacheDurationHours));
      setConcurrency(String(settings.concurrencyLimit));
      setAutoSnapshot(settings.autoSnapshotBeforeUpdate);
      setTheme(settings.theme);
      setPaths(settings.customScanPaths ?? []);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(
      {
        data: {
          safeMode,
          cacheDurationHours: Number(cacheDuration),
          concurrencyLimit: Number(concurrency),
          autoSnapshotBeforeUpdate: autoSnapshot,
          theme: theme as "dark" | "light" | "system",
          customScanPaths: paths,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({ title: "Settings saved" });
        },
      }
    );
  };

  const addPath = () => {
    if (!newPath.trim()) return;
    setPaths((p) => [...p, newPath.trim()]);
    setNewPath("");
  };

  const removePath = (i: number) => {
    setPaths((p) => p.filter((_, idx) => idx !== i));
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-6 w-32 bg-muted rounded animate-pulse mb-6" />
        <div className="space-y-4 max-w-xl">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-card border border-card-border rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const SettingRow = ({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-4 border-b border-border last:border-0">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-2xl" data-testid="settings-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <Button size="sm" onClick={handleSave} disabled={updateSettings.isPending} data-testid="button-save-settings">
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {updateSettings.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Update Behavior */}
      <div className="bg-card border border-card-border rounded-lg px-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3 border-b border-border">Update Behavior</h2>
        <SettingRow
          label="Safe Mode"
          description="Only allow patch updates with 'Update All'. Locks minor and major updates."
        >
          <Switch checked={safeMode} onCheckedChange={setSafeMode} data-testid="switch-safe-mode" />
        </SettingRow>
        <SettingRow
          label="Auto-snapshot before update"
          description="Automatically create a snapshot before running any bulk update."
        >
          <Switch checked={autoSnapshot} onCheckedChange={setAutoSnapshot} data-testid="switch-auto-snapshot" />
        </SettingRow>
      </div>

      {/* Version Checking */}
      <div className="bg-card border border-card-border rounded-lg px-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3 border-b border-border">Version Checking</h2>
        <SettingRow
          label="Cache duration"
          description="How long to cache version check results from PyPI and npm registry."
        >
          <Select value={cacheDuration} onValueChange={setCacheDuration}>
            <SelectTrigger className="w-28 h-8 text-sm" data-testid="select-cache-duration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 hour</SelectItem>
              <SelectItem value="6">6 hours</SelectItem>
              <SelectItem value="24">24 hours</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          label="Concurrency limit"
          description="Maximum simultaneous API calls when checking versions."
        >
          <Select value={concurrency} onValueChange={setConcurrency}>
            <SelectTrigger className="w-24 h-8 text-sm" data-testid="select-concurrency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>

      {/* Appearance */}
      <div className="bg-card border border-card-border rounded-lg px-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3 border-b border-border">Appearance</h2>
        <SettingRow label="Theme">
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger className="w-28 h-8 text-sm" data-testid="select-theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>

      {/* Scan Paths */}
      <div className="bg-card border border-card-border rounded-lg p-4 space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custom Scan Paths</h2>
        {paths.length > 0 && (
          <div className="space-y-2">
            {paths.map((p, i) => (
              <div key={i} className="flex items-center gap-2 bg-muted/40 rounded px-3 py-1.5" data-testid={`scan-path-${i}`}>
                <span className="text-xs font-mono text-foreground flex-1">{p}</span>
                <button onClick={() => removePath(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            className="h-8 text-sm font-mono flex-1"
            placeholder="/home/user/.virtualenvs"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPath()}
            data-testid="input-new-scan-path"
          />
          <Button size="sm" variant="secondary" onClick={addPath} data-testid="button-add-scan-path">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
