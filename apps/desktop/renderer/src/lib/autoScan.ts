import { queryClient } from "./queryClient";
import { usePackageStore } from "@/store/usePackageStore";

type ScanOptions = { force?: boolean };

let scanInFlight: Promise<void> | null = null;

async function loadBootstrap(store: ReturnType<typeof usePackageStore.getState>) {
  const api = (window as any).electronAPI;
  if (!api) {
    console.warn("electronAPI not found. Skipping bootstrap.");
    return { cacheFresh: false };
  }
  if (api.getBootstrap) {
    const { environments, packages, cacheFresh } = await api.getBootstrap();
    if (environments?.length) store.setEnvironments(environments);
    if (packages?.length) {
      store.setPackages(packages);
      const validLastChecked = packages.find((p: any) => typeof p.lastChecked === 'number' && p.lastChecked > 0)?.lastChecked;
      if (validLastChecked) {
        store.setLastScanned(validLastChecked);
      }
    }
    return { cacheFresh: Boolean(cacheFresh && packages?.length) };
  }

  const [cached, envs] = await Promise.all([
    api.getCachedPackages(),
    api.getEnvironments(),
  ]);
  if (envs?.length) store.setEnvironments(envs);
  if (cached?.length) {
    store.setPackages(cached);
    const validLastChecked = cached.find((p: any) => typeof p.lastChecked === 'number' && p.lastChecked > 0)?.lastChecked;
    if (validLastChecked) {
      store.setLastScanned(validLastChecked);
    }
  }
  return { cacheFresh: Boolean(cached?.length) };
}

/**
 * Loads cached data from the local store/database so the UI can paint immediately
 * without executing any scan, environment search, version checks, or network requests.
 */
export async function loadBootstrapData() {
  const store = usePackageStore.getState();
  try {
    await loadBootstrap(store);
    queryClient.invalidateQueries();
  } catch (error) {
    console.error("[BOOTSTRAP] Failed to load cached bootstrap data:", error);
  } finally {
    store.setScanStatus("idle");
  }
}

async function refreshPackages(
  store: ReturnType<typeof usePackageStore.getState>,
  options: { checkVersions?: boolean; rescanEnvironments?: boolean }
) {
  const api = (window as any).electronAPI;
  if (!api) {
    console.warn("electronAPI not found. Skipping package refresh.");
    store.setScanStatus("idle");
    return;
  }

  let envs = store.environments;
  if (options.rescanEnvironments !== false && (options.checkVersions || envs.length === 0)) {
    store.setScanStatus("scanning-envs");
    envs = await api.scanEnvironments();
    store.setEnvironments(envs);
    queryClient.invalidateQueries({ queryKey: ["listEnvironments"] });
  } else if (envs.length === 0) {
    envs = await api.getEnvironments();
    store.setEnvironments(envs);
  }

  store.setScanStatus("scanning-packages");
  const scanResults = await Promise.all(
    envs.map((env: any) => api.scanEnvironment(env.id))
  );
  const allPackages = scanResults.flat();
  store.setPackages(allPackages);
  queryClient.invalidateQueries({ queryKey: ["/api/packages"] });

  if (options.checkVersions !== false && allPackages.length > 0) {
    store.setScanStatus("checking-versions");
    const needsCheck = allPackages.filter(
      (p: { latestVersion?: string | null; status?: string }) =>
        !p.latestVersion || p.status === "unknown"
    );
    const toCheck = needsCheck.length > 0 ? needsCheck : allPackages;

    const versionResults = await api.checkVersions(
      toCheck.map((p: { name: string; installedVersion: string; ecosystem: string; environmentId: string }) => ({
        name: p.name,
        installedVersion: p.installedVersion,
        ecosystem: p.ecosystem,
        environmentId: p.environmentId,
      }))
    );
    store.updatePackageVersions(versionResults);
    queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
  }

  await api.saveScanCache(
    store.packages.map((p) => ({
      name: p.name,
      ecosystem: p.ecosystem,
      envId: p.environmentId,
      installedVersion: p.installedVersion,
      latestVersion: p.latestVersion,
      status: p.status,
      groupName: p.groupName,
    }))
  );

  store.setScanStatus("idle");
  store.setLastScanned(Date.now());
}

export async function runAutoScan(options: ScanOptions = {}) {
  const { force = false } = options;

  // Gate automatic/background scanning:
  // If force !== true (i.e. not an explicit user-initiated scan like "Scan Now" or "Allow & Start"),
  // verify that background scanning permission has actually been granted!
  if (!force) {
    const api = (window as any).electronAPI;
    if (api?.getSettings) {
      try {
        const settings = await api.getSettings();
        if (settings?.backgroundPermission !== true) {
          console.log("[AUTO-SCAN] Background scanning permission not granted (state:", settings?.backgroundPermission, "). Aborting automatic scan.");
          usePackageStore.getState().setScanStatus("idle");
          return;
        }
      } catch (err) {
        console.warn("[AUTO-SCAN] Could not verify background permission:", err);
        usePackageStore.getState().setScanStatus("idle");
        return;
      }
    }
  }

  if (scanInFlight) return scanInFlight;

  const store = usePackageStore.getState();

  scanInFlight = (async () => {
    store.setScanStatus("idle");

    try {
      const { cacheFresh } = await loadBootstrap(store);
      queryClient.invalidateQueries();

      if (cacheFresh && !force) {
        // Let the UI paint cached data, then refresh disk state in the background
        await new Promise((r) => setTimeout(r, 1500));
        // Double-check permission in case it was revoked while waiting
        const api = (window as any).electronAPI;
        if (api?.getSettings) {
          const s = await api.getSettings();
          if (s?.backgroundPermission !== true) {
            console.log("[AUTO-SCAN] Permission not granted. Skipping background package refresh.");
            return;
          }
        }
        await refreshPackages(store, { checkVersions: false, rescanEnvironments: false });
        return;
      }

      await refreshPackages(store, { checkVersions: true, rescanEnvironments: true });
    } catch (error) {
      console.error("[AUTO-SCAN] Failed:", error);
      store.setScanStatus("idle");
    } finally {
      scanInFlight = null;
    }
  })();

  return scanInFlight;
}
