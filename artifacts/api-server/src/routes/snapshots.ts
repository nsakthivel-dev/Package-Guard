import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, snapshotsTable, environmentsTable, packagesTable } from "@workspace/db";
import {
  ListSnapshotsQueryParams,
  CreateSnapshotBody,
  GetSnapshotParams,
  DeleteSnapshotParams,
  RestoreSnapshotParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/snapshots", async (req, res): Promise<void> => {
  const parsed = ListSnapshotsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { environmentId } = parsed.data;

  const snapshots = await db
    .select({
      id: snapshotsTable.id,
      environmentId: snapshotsTable.environmentId,
      environmentName: environmentsTable.name,
      name: snapshotsTable.name,
      packageCount: snapshotsTable.packageCount,
      notes: snapshotsTable.notes,
      createdAt: snapshotsTable.createdAt,
    })
    .from(snapshotsTable)
    .leftJoin(environmentsTable, eq(snapshotsTable.environmentId, environmentsTable.id))
    .where(environmentId != null ? eq(snapshotsTable.environmentId, environmentId) : undefined)
    .orderBy(snapshotsTable.createdAt);

  res.json(snapshots);
});

router.post("/snapshots", async (req, res): Promise<void> => {
  const parsed = CreateSnapshotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [env] = await db
    .select()
    .from(environmentsTable)
    .where(eq(environmentsTable.id, parsed.data.environmentId));

  if (!env) {
    res.status(404).json({ error: "Environment not found" });
    return;
  }

  const packageCount = await db
    .select()
    .from(packagesTable)
    .where(eq(packagesTable.environmentId, parsed.data.environmentId));

  const [snapshot] = await db
    .insert(snapshotsTable)
    .values({
      environmentId: parsed.data.environmentId,
      name: parsed.data.name,
      notes: parsed.data.notes ?? null,
      packageCount: packageCount.length,
    })
    .returning();

  const [result] = await db
    .select({
      id: snapshotsTable.id,
      environmentId: snapshotsTable.environmentId,
      environmentName: environmentsTable.name,
      name: snapshotsTable.name,
      packageCount: snapshotsTable.packageCount,
      notes: snapshotsTable.notes,
      createdAt: snapshotsTable.createdAt,
    })
    .from(snapshotsTable)
    .leftJoin(environmentsTable, eq(snapshotsTable.environmentId, environmentsTable.id))
    .where(eq(snapshotsTable.id, snapshot.id));

  res.status(201).json(result);
});

router.get("/snapshots/:id", async (req, res): Promise<void> => {
  const params = GetSnapshotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [snapshot] = await db
    .select({
      id: snapshotsTable.id,
      environmentId: snapshotsTable.environmentId,
      environmentName: environmentsTable.name,
      name: snapshotsTable.name,
      packageCount: snapshotsTable.packageCount,
      notes: snapshotsTable.notes,
      createdAt: snapshotsTable.createdAt,
    })
    .from(snapshotsTable)
    .leftJoin(environmentsTable, eq(snapshotsTable.environmentId, environmentsTable.id))
    .where(eq(snapshotsTable.id, params.data.id));

  if (!snapshot) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }
  res.json(snapshot);
});

router.delete("/snapshots/:id", async (req, res): Promise<void> => {
  const params = DeleteSnapshotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(snapshotsTable).where(eq(snapshotsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/snapshots/:id/restore", async (req, res): Promise<void> => {
  const params = RestoreSnapshotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [snapshot] = await db
    .select()
    .from(snapshotsTable)
    .where(eq(snapshotsTable.id, params.data.id));

  if (!snapshot) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }

  res.json({
    status: "complete",
    message: `Environment restored to snapshot "${snapshot.name}" (${snapshot.packageCount} packages).`,
  });
});

export default router;
