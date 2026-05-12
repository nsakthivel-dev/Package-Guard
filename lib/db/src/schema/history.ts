import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const historyTable = pgTable("update_history", {
  id: serial("id").primaryKey(),
  packageName: text("package_name").notNull(),
  ecosystem: text("ecosystem").notNull(),
  environmentId: integer("environment_id").notNull(),
  environmentName: text("environment_name").notNull(),
  fromVersion: text("from_version").notNull(),
  toVersion: text("to_version").notNull(),
  status: text("status").notNull(), // success | failed | skipped
  errorMessage: text("error_message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHistorySchema = createInsertSchema(historyTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertHistory = z.infer<typeof insertHistorySchema>;
export type HistoryEntry = typeof historyTable.$inferSelect;
