import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { appLocationHook, isFileProtocol } from "@/lib/appRouter";
import { queryClient } from "@/lib/queryClient";
import { runAutoScan, loadBootstrapData } from "@/lib/autoScan";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { Layout } from "@/components/Layout";
import { PermissionDialog } from "@/components/PermissionDialog";
import Dashboard from "@/pages/Dashboard";
import DetailedAnalysis from "@/pages/DetailedAnalysis";
import Environments from "@/pages/Environments";
import Packages from "@/pages/Packages";
import Snapshots from "@/pages/Snapshots";
import History from "@/pages/History";
import SettingsPage from "@/pages/SettingsPage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import NotFound from "@/pages/not-found";

function Router() {
  useEffect(() => {
    if (isFileProtocol && !window.location.hash) {
      window.location.hash = "/";
    }

    const initStartup = async () => {
      // Gate automatic data loading and scanning on startup:
      // ONLY paint cached data and trigger scan if user has already granted permission.
      // If permission is undecided (null) or denied (false), DO NOT load packages or start scan!
      const api = (window as any).electronAPI;
      if (api?.getSettings) {
        try {
          const settings = await api.getSettings();
          if (settings?.backgroundPermission === true) {
            console.log("[STARTUP] Background scanning permission active. Loading bootstrap data & running scan.");
            await loadBootstrapData();
            runAutoScan();
          } else {
            console.log("[STARTUP] Background permission not granted or awaiting decision (state:", settings?.backgroundPermission, "). No scan started and no bootstrap data loaded.");
          }
        } catch (e) {
          console.warn("[STARTUP] Could not verify settings:", e);
        }
      }
    };

    initStartup();

    // Listen for live data-changed push from IPC bridge (Layer 2 socket/pipe)
    // Fired whenever the CLI writes to db.json while the GUI is open.
    let unlistenDataChanged: (() => void) | undefined;
    if ((window as any).electronAPI?.onDataChanged) {
      unlistenDataChanged = (window as any).electronAPI.onDataChanged((_data: any) => {
        console.log('[SYNC] core:data-changed received — refreshing all project data');
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        queryClient.invalidateQueries({ queryKey: ['projects', 'packages'] });
        queryClient.invalidateQueries({ queryKey: ['/api/snapshots'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
        queryClient.invalidateQueries({ queryKey: ['/api/history'] });
      });
    }

    // Listen for background-scan trigger from main process
    let unlistenAutoScan: (() => void) | undefined;
    if ((window as any).electronAPI?.onAutoScanTrigger) {
      unlistenAutoScan = (window as any).electronAPI.onAutoScanTrigger(async () => {
        const api = (window as any).electronAPI;
        if (api?.getSettings) {
          const s = await api.getSettings();
          if (s?.backgroundPermission === true) {
            console.log('[SCHEDULER] Triggered background rescan');
            runAutoScan();
          } else {
            console.log('[SCHEDULER] Background rescan skipped — permission not granted');
          }
        }
      });
    }

    // Listen for project scan snapshots from `pg scan` CLI command
    // Invalidate TanStack Query cache so Snapshots + Venv pages refresh automatically
    let unlistenProjectScan: (() => void) | undefined;
    if ((window as any).electronAPI?.onProjectScanUpdate) {
      unlistenProjectScan = (window as any).electronAPI.onProjectScanUpdate((snapshot: any) => {
        console.log('[CLI] Received project scan snapshot:', snapshot?.projectName, `(${(snapshot?.environments ?? []).reduce((s: number, e: any) => s + (e?.totalPackages ?? 0), 0)} packages)`);
        // Invalidate all queries so Snapshots / Venv / Dashboard pages reload data
        queryClient.invalidateQueries();
      });
    }

    // Listen for snapshot-created events from CLI (both HTTP-path commits and standalone notify)
    let unlistenSnapshotCreated: (() => void) | undefined;
    if ((window as any).electronAPI?.onSnapshotCreated) {
      const handler = (_data: any) => {
        console.log('[CLI] snapshot-created event — refreshing projects + snapshots');
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        queryClient.invalidateQueries({ queryKey: ['projects', 'packages'] });
        queryClient.invalidateQueries({ queryKey: ['/api/snapshots'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
        queryClient.invalidateQueries({ queryKey: ['/api/history'] });
      };
      // onSnapshotCreated uses ipcRenderer.on (not invoke), so it doesn't return a cleanup fn
      // We need to use the raw electron API pattern — check if a cleanup is returned
      const maybeCleanup = (window as any).electronAPI.onSnapshotCreated(handler);
      if (typeof maybeCleanup === 'function') {
        unlistenSnapshotCreated = maybeCleanup;
      }
    }

    // Listen for projects:updated event (fires after pg init / pg scan / pg commit in any mode)
    let unlistenProjectsUpdated: (() => void) | undefined;
    if ((window as any).electronAPI?.onProjectsUpdated) {
      unlistenProjectsUpdated = (window as any).electronAPI.onProjectsUpdated((_data: any) => {
        console.log('[CLI] projects:updated event — refreshing projects data');
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        queryClient.invalidateQueries({ queryKey: ['projects', 'packages'] });
        queryClient.invalidateQueries({ queryKey: ['/api/snapshots'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      });
    }

    return () => {
      if (typeof unlistenDataChanged === 'function') unlistenDataChanged();
      if (typeof unlistenAutoScan === 'function') unlistenAutoScan();
      if (typeof unlistenProjectScan === 'function') unlistenProjectScan();
      if (typeof unlistenSnapshotCreated === 'function') unlistenSnapshotCreated();
      if (typeof unlistenProjectsUpdated === 'function') unlistenProjectsUpdated();
    };
  }, []);

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard/detailed" component={DetailedAnalysis} />
        <Route path="/environments" component={Environments} />
        <Route path="/packages" component={Packages} />
        <Route path="/snapshots" component={Snapshots} />
        <Route path="/history" component={History} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/settings/privacy" component={PrivacyPolicyPage} />
        <Route path="/privacy" component={PrivacyPolicyPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter hook={appLocationHook}>
            <PermissionDialog />
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
