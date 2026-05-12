import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length > 0) return rows[0];

  const [created] = await db
    .insert(settingsTable)
    .values({
      safeMode: true,
      cacheDurationHours: 6,
      concurrencyLimit: 5,
      autoSnapshotBeforeUpdate: true,
      theme: "dark",
      customScanPaths: "[]",
    })
    .returning();
  return created;
}

function settingsToResponse(s: typeof settingsTable.$inferSelect) {
  return {
    ...s,
    customScanPaths: JSON.parse(s.customScanPaths || "[]") as string[],
  };
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(settingsToResponse(settings));
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settings = await getOrCreateSettings();

  const updateData: Record<string, unknown> = {};
  if (parsed.data.safeMode !== undefined) updateData.safeMode = parsed.data.safeMode;
  if (parsed.data.cacheDurationHours !== undefined) updateData.cacheDurationHours = parsed.data.cacheDurationHours;
  if (parsed.data.concurrencyLimit !== undefined) updateData.concurrencyLimit = parsed.data.concurrencyLimit;
  if (parsed.data.autoSnapshotBeforeUpdate !== undefined) updateData.autoSnapshotBeforeUpdate = parsed.data.autoSnapshotBeforeUpdate;
  if (parsed.data.theme !== undefined) updateData.theme = parsed.data.theme;
  if (parsed.data.customScanPaths !== undefined) updateData.customScanPaths = JSON.stringify(parsed.data.customScanPaths);

  const [updated] = await db
    .update(settingsTable)
    .set(updateData)
    .where(eq(settingsTable.id, settings.id))
    .returning();

  res.json(settingsToResponse(updated));
});

export default router;
