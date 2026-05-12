import { pgTable, text, serial, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  safeMode: boolean("safe_mode").notNull().default(true),
  cacheDurationHours: integer("cache_duration_hours").notNull().default(6),
  concurrencyLimit: integer("concurrency_limit").notNull().default(5),
  autoSnapshotBeforeUpdate: boolean("auto_snapshot_before_update").notNull().default(true),
  theme: text("theme").notNull().default("dark"), // dark | light | system
  customScanPaths: text("custom_scan_paths").notNull().default("[]"), // JSON array
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
