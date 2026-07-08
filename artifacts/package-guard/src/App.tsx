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

    // Listen for scheduled trigger
    if ((window as any).electronAPI?.onAutoScanTrigger) {
      (window as any).electronAPI.onAutoScanTrigger(() => {
        console.log('[SCHEDULER] Triggered background rescan');
        runAutoScan();
      });
    }

    return () => {
      // If there was an unlisten function, call it here. 
      // Based on preload.js, it's just an ipcRenderer.on, so we might need a way to remove it.
      // For now, we'll just leave it as is or implement a proper cleanup if needed.
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
