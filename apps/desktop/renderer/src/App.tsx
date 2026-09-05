import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { appLocationHook, isFileProtocol } from "@/lib/appRouter";
import { queryClient } from "@/lib/queryClient";
import { runAutoScan } from "@/lib/autoScan";
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
import NotFound from "@/pages/not-found";
function Router() {
  useEffect(() => {
    if (isFileProtocol && !window.location.hash) {
      window.location.hash = "/";
    }

    runAutoScan();

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
      unlistenAutoScan = (window as any).electronAPI.onAutoScanTrigger(() => {
        console.log('[SCHEDULER] Triggered background rescan');
        runAutoScan();
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
