import { Router, type IRouter } from "express";
import { eq, and, ilike, sql } from "drizzle-orm";
import { db, packagesTable, environmentsTable, historyTable } from "@workspace/db";
import {
  ListPackagesQueryParams,
  GetPackageParams,
  UpdatePackageGroupParams,
  UpdatePackageGroupBody,
  UpdatePackagesBody,
  CheckVersionsBody,
} from "@workspace/api-zod";
import { getGroupForPackage } from "../lib/groupTags";

const router: IRouter = Router();

router.get("/packages", async (req, res): Promise<void> => {
  const parsed = ListPackagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { environmentId, status, groupName, search } = parsed.data;

  const packages = await db.select({
    id: packagesTable.id,
    name: packagesTable.name,
    ecosystem: packagesTable.ecosystem,
    environmentId: packagesTable.environmentId,
    environmentName: environmentsTable.name,
    installedVersion: packagesTable.installedVersion,
    latestVersion: packagesTable.latestVersion,
    status: packagesTable.status,
    groupName: packagesTable.groupName,
    description: packagesTable.description,
    homepageUrl: packagesTable.homepageUrl,
    lastChecked: packagesTable.lastChecked,
  })
    .from(packagesTable)
    .leftJoin(environmentsTable, eq(packagesTable.environmentId, environmentsTable.id))
    .where(
      and(
        environmentId != null ? eq(packagesTable.environmentId, environmentId) : undefined,
        status != null ? eq(packagesTable.status, status) : undefined,
        groupName != null ? eq(packagesTable.groupName, groupName) : undefined,
        search != null ? ilike(packagesTable.name, `%${search}%`) : undefined,
      )
    )
    .orderBy(packagesTable.name);

  res.json(packages);
});

router.get("/packages/:id", async (req, res): Promise<void> => {
  const params = GetPackageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [pkg] = await db
    .select({
      id: packagesTable.id,
      name: packagesTable.name,
      ecosystem: packagesTable.ecosystem,
      environmentId: packagesTable.environmentId,
      environmentName: environmentsTable.name,
      installedVersion: packagesTable.installedVersion,
      latestVersion: packagesTable.latestVersion,
      status: packagesTable.status,
      groupName: packagesTable.groupName,
      description: packagesTable.description,
      homepageUrl: packagesTable.homepageUrl,
      lastChecked: packagesTable.lastChecked,
    })
    .from(packagesTable)
    .leftJoin(environmentsTable, eq(packagesTable.environmentId, environmentsTable.id))
    .where(eq(packagesTable.id, params.data.id));

  if (!pkg) {
    res.status(404).json({ error: "Package not found" });
    return;
  }
  res.json(pkg);
});

router.patch("/packages/:id", async (req, res): Promise<void> => {
  const params = UpdatePackageGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdatePackageGroupBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [updated] = await db
    .update(packagesTable)
    .set({ groupName: body.data.groupName })
    .where(eq(packagesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  const [pkg] = await db
    .select({
      id: packagesTable.id,
      name: packagesTable.name,
      ecosystem: packagesTable.ecosystem,
      environmentId: packagesTable.environmentId,
      environmentName: environmentsTable.name,
      installedVersion: packagesTable.installedVersion,
      latestVersion: packagesTable.latestVersion,
      status: packagesTable.status,
      groupName: packagesTable.groupName,
      description: packagesTable.description,
      homepageUrl: packagesTable.homepageUrl,
      lastChecked: packagesTable.lastChecked,
    })
    .from(packagesTable)
    .leftJoin(environmentsTable, eq(packagesTable.environmentId, environmentsTable.id))
    .where(eq(packagesTable.id, params.data.id));

  res.json(pkg);
});

router.post("/packages/update", async (req, res): Promise<void> => {
  const parsed = UpdatePackagesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { environmentId, packages } = parsed.data;
  const [env] = await db
    .select()
    .from(environmentsTable)
    .where(eq(environmentsTable.id, environmentId));

  if (!env) {
    res.status(404).json({ error: "Environment not found" });
    return;
  }

  const jobId = `job_${Date.now()}`;

  for (const pkg of packages) {
    const [existing] = await db
      .select()
      .from(packagesTable)
      .where(
        and(
          eq(packagesTable.name, pkg.name),
          eq(packagesTable.environmentId, environmentId)
        )
      );

    if (existing) {
      const fromVersion = existing.installedVersion;
      await db
        .update(packagesTable)
        .set({
          installedVersion: pkg.targetVersion,
          status: "up-to-date",
          lastChecked: new Date(),
        })
        .where(eq(packagesTable.id, existing.id));

      await db.insert(historyTable).values({
        packageName: pkg.name,
        ecosystem: existing.ecosystem,
        environmentId,
        environmentName: env.name,
        fromVersion,
        toVersion: pkg.targetVersion,
        status: "success",
        errorMessage: null,
      });
    }
  }

  await db
    .update(environmentsTable)
    .set({
      packageCount: sql`(SELECT COUNT(*) FROM packages WHERE environment_id = ${environmentId})`,
    })
    .where(eq(environmentsTable.id, environmentId));

  res.json({
    jobId,
    totalPackages: packages.length,
    status: "complete",
  });
});

router.post("/packages/check-versions", async (req, res): Promise<void> => {
  const parsed = CheckVersionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { environmentId } = parsed.data;
  const pkgs = await db
    .select()
    .from(packagesTable)
    .where(eq(packagesTable.environmentId, environmentId));

  await db
    .update(packagesTable)
    .set({ lastChecked: new Date() })
    .where(eq(packagesTable.environmentId, environmentId));

  const result = await db
    .select({
      id: packagesTable.id,
      name: packagesTable.name,
      ecosystem: packagesTable.ecosystem,
      environmentId: packagesTable.environmentId,
      environmentName: environmentsTable.name,
      installedVersion: packagesTable.installedVersion,
      latestVersion: packagesTable.latestVersion,
      status: packagesTable.status,
      groupName: packagesTable.groupName,
      description: packagesTable.description,
      homepageUrl: packagesTable.homepageUrl,
      lastChecked: packagesTable.lastChecked,
    })
    .from(packagesTable)
    .leftJoin(environmentsTable, eq(packagesTable.environmentId, environmentsTable.id))
    .where(eq(packagesTable.environmentId, environmentId));

  res.json(result);
});

export default router;
