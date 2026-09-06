import { migrate as drizzleMigrate } from "drizzle-orm/bun-sqlite/migrator";
import { getDb } from "./client";

export function migrate(migrationsFolder = "./drizzle"): void {
  drizzleMigrate(getDb(), { migrationsFolder });
}
