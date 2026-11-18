import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const lexiBackups = sqliteTable("lexi_backups", {
  userId: text("user_id").primaryKey(),
  revision: integer("revision").notNull(),
  state: text("state").notNull(),
  updatedAt: integer("updated_at").notNull(),
  writeId: text("write_id").notNull(),
});

export const lexiBackupHistory = sqliteTable("lexi_backup_history", {
  userId: text("user_id").notNull(),
  revision: integer("revision").notNull(),
  state: text("state").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.revision] })]);
