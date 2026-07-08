export type CustomFetchOptions = RequestInit & {
  responseType?: "json" | "text" | "blob" | "auto";
};

export type ErrorType<T = unknown> = ApiError<T>;

export type BodyType<T> = T;

export class ApiError<T = unknown> extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly statusText: string;
  readonly data: T | null;
  readonly method: string;
  readonly url: string;

  constructor(
    status: number,
    statusText: string,
    data: T | null,
    requestInfo: { method: string; url: string },
  ) {
    super(`HTTP ${status} ${statusText}`);
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = status;
    this.statusText = statusText;
    this.data = data;
    this.method = requestInfo.method;
    this.url = requestInfo.url;
  }
}

export async function customFetch<T = unknown>(
  input: string | URL | Request,
  options: CustomFetchOptions = {},
): Promise<T> {
  const url = typeof input === "string" ? input : (input as any).url || input.toString();
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body as string) : null;

  console.log(`Electron Bridge: ${method} ${url}`, body);

  if (!window.electronAPI) {
    console.warn("electronAPI not found on window object. Returning mock data for preview.");
    
    // Return empty arrays/objects to prevent frontend from crashing in browser
    if (url === "/api/dashboard/summary") return { 
      totalPackages: 0, 
      vulnerablePackages: 0, 
      outdatedPackages: 0, 
      upToDatePackages: 0,
      recentActivity: []
    } as any;
    if (url === "/api/dashboard/status-breakdown") return [] as any;
    if (url.startsWith("/api/dashboard/recent-activity") || url.startsWith("/api/history")) return [] as any;
    if (url === "/api/environments") return [] as any;
    if (url.startsWith("/api/packages")) return [] as any;
    if (url === "/api/settings") return {} as any;
    if (url === "/api/snapshots") return [] as any;

    return {} as any;
  }

  const api = window.electronAPI;

  const normalizeHistoryEntry = (entry: Record<string, unknown>) => {
    const updatedAt = entry.updatedAt ?? entry.updated_at;
    return {
      id: entry.id,
      packageName: entry.packageName ?? entry.package_name,
      ecosystem: entry.ecosystem,
      environmentName: entry.environmentName ?? entry.environment_name ?? "Unknown",
      fromVersion: entry.fromVersion ?? entry.from_version ?? "",
      toVersion: entry.toVersion ?? entry.to_version ?? "",
      status: entry.status,
      errorMessage: entry.errorMessage ?? entry.error_message ?? null,
      updatedAt:
        typeof updatedAt === "number"
          ? new Date(updatedAt).toISOString()
          : String(updatedAt ?? new Date().toISOString()),
    };
  };

  try {
    // Dashboard
    if (url === "/api/dashboard/summary") return await api.getDashboardSummary();
    if (url.startsWith("/api/dashboard/recent-activity")) {
      const params = new URLSearchParams(url.split("?")[1] || "");
      const rows = await api.getHistory(Number(params.get("limit") || 10));
      return rows.map((entry) => normalizeHistoryEntry(entry)) as any;
    }
    if (url.startsWith("/api/history")) {
      const params = new URLSearchParams(url.split("?")[1] || "");
      const rows = await api.getHistory(Number(params.get("limit") || 50));
      return rows.map((entry) => normalizeHistoryEntry(entry)) as any;
    }
    if (url === "/api/dashboard/status-breakdown") return await api.getStatusBreakdown() as any;

    // Environments
    if (url === "/api/environments") {
      if (method === "GET") return await api.getEnvironments() as any;
      if (method === "POST") return await api.createEnvironment(body) as any;
    }
    if (url.startsWith("/api/environments/")) {
      const id = url.split("/")[3];
      if (url.endsWith("/scan")) return await api.scanEnvironment(id) as any;
      if (method === "GET") return await api.getEnvironments().then((envs: any[]) => envs.find((e: any) => e.id === id)) as any;
      if (method === "DELETE") return await api.deleteEnvironment(id) as any;
    }

    // Packages
    if (url.startsWith("/api/packages")) {
      if (url === "/api/packages/check-versions") return await api.checkVersions(body.packages) as any;
      
      if (url === "/api/packages/update") {
        const envs = await api.getEnvironments();
        const env = envs.find((e: any) => e.id === body.environmentId);
        
        if (body.packages && Array.isArray(body.packages)) {
          return await api.updateBatch({
            packages: body.packages.map((p: any) => ({
              name: p.name,
              targetVersion: p.targetVersion,
              ecosystem: env?.type || "npm"
            })),
            envPath: env?.path
          }) as any;
        }
        
        return await api.updatePackage({
          packageName: body.name || (body.packages && body.packages[0]?.name),
          targetVersion: body.targetVersion || (body.packages && body.packages[0]?.targetVersion),
          ecosystem: env?.type || "npm",
          envPath: env?.path
        }) as any;
      }

      // Handle DELETE /api/packages/:id
      if (method === "DELETE" && url.split("/").length === 4) {
        const id = url.split("/")[3];
        // We need to find the package first to get its name and environment
        const allPackages = await api.getPackages({});
        const pkg = allPackages.find((p: any) => String(p.id) === id);
        if (pkg) {
          const envs = await api.getEnvironments();
          const env = envs.find((e: any) => e.id === pkg.environmentId);
          return await api.deletePackage({
            packageName: pkg.name,
            ecosystem: pkg.ecosystem,
            envPath: env?.path
          }) as any;
        }
        throw new Error(`Package with ID ${id} not found`);
      }

      const searchParams = new URLSearchParams(url.split("?")[1]);
      const params: Record<string, string> = {};
      searchParams.forEach((value, key) => {
        params[key] = value;
      });
      return await api.getPackages(params) as any;
    }

    // Settings
    if (url === "/api/healthz") return { status: "ok" } as any;
    if (url === "/api/settings") {
      if (method === "GET") return await api.getSettings() as any;
      if (method === "PATCH" || method === "POST") return await api.updateSettings(body) as any;
    }

    // Snapshots
    if (url === "/api/snapshots") {
      if (method === "GET") return await api.getSnapshots() as any;
      if (method === "POST") return await api.createSnapshot(body) as any;
    }
    if (url.startsWith("/api/snapshots/")) {
      const parts = url.split("/");
      const id = parseInt(parts[3]);
      if (parts[4] === "restore") return await api.restoreSnapshot(id) as any;
      if (method === "DELETE") return await api.deleteSnapshot(id) as any;
    }

    throw new Error(`Unhandled API route: ${method} ${url}`);
  } catch (error: any) {
    console.error(`API Bridge Error (${url}):`, error);
    throw new ApiError(500, "Internal Server Error", { error: error.message }, { method, url });
  }
}
