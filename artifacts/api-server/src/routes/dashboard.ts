import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, packagesTable, environmentsTable, historyTable } from "@workspace/db";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      totalPackages: sql<number>`COUNT(*)`,
    })
    .from(packagesTable);

  const [envCount] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(environmentsTable);

  const statusCounts = await db
    .select({
      status: packagesTable.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(packagesTable)
    .groupBy(packagesTable.status);

  const countByStatus = (s: string) =>
    Number(statusCounts.find((r) => r.status === s)?.count ?? 0);

  const upToDate = countByStatus("up-to-date");
  const patchUpdates = countByStatus("patch");
  const minorUpdates = countByStatus("minor");
  const majorUpdates = countByStatus("major");
  const failedPackages = countByStatus("failed");
  const needsUpdate = patchUpdates + minorUpdates + majorUpdates;

  const [lastEnv] = await db
    .select({ lastScanned: environmentsTable.lastScanned })
    .from(environmentsTable)
    .orderBy(desc(environmentsTable.lastScanned))
    .limit(1);

  res.json({
    totalPackages: Number(totals?.totalPackages ?? 0),
    totalEnvironments: Number(envCount?.total ?? 0),
    upToDate,
    needsUpdate,
    majorUpdates,
    minorUpdates,
    patchUpdates,
    failedPackages,
    lastScanAt: lastEnv?.lastScanned?.toISOString() ?? null,
  });
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const parsed = GetRecentActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const limit = parsed.data.limit ?? 10;

  const rows = await db
    .select()
    .from(historyTable)
    .orderBy(desc(historyTable.updatedAt))
    .limit(limit);

  res.json(rows);
});

router.get("/dashboard/status-breakdown", async (_req, res): Promise<void> => {
  const envs = await db.select().from(environmentsTable);

  const breakdown = await Promise.all(
    envs.map(async (env) => {
      const statusCounts = await db
        .select({
          status: packagesTable.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(packagesTable)
        .where(eq(packagesTable.environmentId, env.id))
        .groupBy(packagesTable.status);

      const countByStatus = (s: string) =>
        Number(statusCounts.find((r) => r.status === s)?.count ?? 0);

      return {
        environmentId: env.id,
        environmentName: env.name,
        upToDate: countByStatus("up-to-date"),
        patch: countByStatus("patch"),
        minor: countByStatus("minor"),
        major: countByStatus("major"),
        failed: countByStatus("failed"),
        unknown: countByStatus("unknown"),
      };
    })
  );

  res.json(breakdown);
});

export default router;
