import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, environmentsTable, packagesTable } from "@workspace/db";
import {
  CreateEnvironmentBody,
  GetEnvironmentParams,
  DeleteEnvironmentParams,
  ScanEnvironmentParams,
} from "@workspace/api-zod";
import { groupTagsMap } from "../lib/groupTags";

const router: IRouter = Router();

router.get("/environments", async (req, res): Promise<void> => {
  const envs = await db
    .select()
    .from(environmentsTable)
    .orderBy(environmentsTable.createdAt);
  res.json(envs);
});

router.post("/environments", async (req, res): Promise<void> => {
  const parsed = CreateEnvironmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [env] = await db
    .insert(environmentsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(env);
});

router.get("/environments/:id", async (req, res): Promise<void> => {
  const params = GetEnvironmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [env] = await db
    .select()
    .from(environmentsTable)
    .where(eq(environmentsTable.id, params.data.id));
  if (!env) {
    res.status(404).json({ error: "Environment not found" });
    return;
  }
  res.json(env);
});

router.delete("/environments/:id", async (req, res): Promise<void> => {
  const params = DeleteEnvironmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(environmentsTable)
    .where(eq(environmentsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/environments/:id/scan", async (req, res): Promise<void> => {
  const params = ScanEnvironmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [env] = await db
    .select()
    .from(environmentsTable)
    .where(eq(environmentsTable.id, params.data.id));
  if (!env) {
    res.status(404).json({ error: "Environment not found" });
    return;
  }

  const existingPackages = await db
    .select()
    .from(packagesTable)
    .where(eq(packagesTable.environmentId, params.data.id));

  const statuses = ["up-to-date", "patch", "minor", "major", "unknown"] as const;
  let newPackages = 0;

  if (existingPackages.length === 0) {
    const samplePipPackages = [
      { name: "numpy", installedVersion: "1.24.3", latestVersion: "1.26.4", status: "minor", description: "Fundamental package for array computing", homepageUrl: "https://numpy.org" },
      { name: "pandas", installedVersion: "2.0.3", latestVersion: "2.2.1", status: "minor", description: "Data analysis and manipulation library", homepageUrl: "https://pandas.pydata.org" },
      { name: "requests", installedVersion: "2.31.0", latestVersion: "2.31.0", status: "up-to-date", description: "HTTP library for Python", homepageUrl: "https://requests.readthedocs.io" },
      { name: "torch", installedVersion: "2.0.1", latestVersion: "2.2.0", status: "minor", description: "Tensors and neural networks", homepageUrl: "https://pytorch.org" },
      { name: "flask", installedVersion: "2.3.3", latestVersion: "3.0.2", status: "major", description: "Lightweight WSGI web framework", homepageUrl: "https://flask.palletsprojects.com" },
      { name: "pytest", installedVersion: "7.4.4", latestVersion: "8.1.1", status: "major", description: "Testing framework", homepageUrl: "https://pytest.org" },
      { name: "black", installedVersion: "24.1.0", latestVersion: "24.3.0", status: "patch", description: "Code formatter", homepageUrl: "https://black.readthedocs.io" },
      { name: "scikit-learn", installedVersion: "1.3.2", latestVersion: "1.4.1", status: "minor", description: "Machine learning library", homepageUrl: "https://scikit-learn.org" },
    ];

    for (const pkg of samplePipPackages) {
      const groupName = Object.entries(groupTagsMap).find(([, pkgs]) =>
        pkgs.includes(pkg.name)
      )?.[0] ?? "Others";

      await db.insert(packagesTable).values({
        name: pkg.name,
        ecosystem: env.type,
        environmentId: params.data.id,
        installedVersion: pkg.installedVersion,
        latestVersion: pkg.latestVersion,
        status: pkg.status,
        groupName,
        description: pkg.description,
        homepageUrl: pkg.homepageUrl,
      });
    }
    newPackages = samplePipPackages.length;

    await db
      .update(environmentsTable)
      .set({
        packageCount: samplePipPackages.length,
        lastScanned: new Date(),
      })
      .where(eq(environmentsTable.id, params.data.id));
  } else {
    await db
      .update(environmentsTable)
      .set({ lastScanned: new Date() })
      .where(eq(environmentsTable.id, params.data.id));
  }

  res.json({
    packagesFound: existingPackages.length + newPackages,
    newPackages,
    updatedPackages: 0,
  });
});

export default router;
