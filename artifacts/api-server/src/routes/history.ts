import { Router, type IRouter } from "express";
import { and, gte, lte, eq } from "drizzle-orm";
import { db, historyTable } from "@workspace/db";
import { ListHistoryQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/history", async (req, res): Promise<void> => {
  const parsed = ListHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ecosystem, status, dateFrom, dateTo, limit, offset } = parsed.data;

  const conditions = [];
  if (ecosystem != null) conditions.push(eq(historyTable.ecosystem, ecosystem));
  if (status != null) conditions.push(eq(historyTable.status, status));
  if (dateFrom != null) conditions.push(gte(historyTable.updatedAt, new Date(dateFrom)));
  if (dateTo != null) conditions.push(lte(historyTable.updatedAt, new Date(dateTo)));

  const query = db
    .select()
    .from(historyTable)
    .where(and(...conditions))
    .orderBy(historyTable.updatedAt);

  const rows = await query;
  const sliced = rows.slice(offset ?? 0, (offset ?? 0) + (limit ?? 100));

  res.json(sliced);
});

export default router;
