import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const packagesTable = pgTable("packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ecosystem: text("ecosystem").notNull(), // pip | npm | conda | venv | nvm
  environmentId: integer("environment_id").notNull(),
  installedVersion: text("installed_version").notNull(),
  latestVersion: text("latest_version"),
  status: text("status").notNull().default("unknown"), // up-to-date | patch | minor | major | failed | unknown
  groupName: text("group_name").notNull().default("Others"),
  description: text("description"),
  homepageUrl: text("homepage_url"),
  lastChecked: timestamp("last_checked", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPackageSchema = createInsertSchema(packagesTable).omit({
  id: true,
  lastChecked: true,
});
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packagesTable.$inferSelect;
