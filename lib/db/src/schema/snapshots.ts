import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const snapshotsTable = pgTable("snapshots", {
  id: serial("id").primaryKey(),
  environmentId: integer("environment_id").notNull(),
  name: text("name").notNull(),
  packageCount: integer("package_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSnapshotSchema = createInsertSchema(snapshotsTable).omit({
  id: true,
  createdAt: true,
  packageCount: true,
});
export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type Snapshot = typeof snapshotsTable.$inferSelect;
