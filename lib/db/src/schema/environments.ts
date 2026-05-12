import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const environmentsTable = pgTable("environments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // pip | venv | conda | npm | nvm
  path: text("path").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  packageCount: integer("package_count").notNull().default(0),
  lastScanned: timestamp("last_scanned", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEnvironmentSchema = createInsertSchema(environmentsTable).omit({
  id: true,
  createdAt: true,
  packageCount: true,
  lastScanned: true,
});
export type InsertEnvironment = z.infer<typeof insertEnvironmentSchema>;
export type Environment = typeof environmentsTable.$inferSelect;
