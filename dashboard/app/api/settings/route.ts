import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { getDashboardAccess } from "@/lib/auth";
import { getDashboardConfiguration } from "@/lib/server-config";

export async function PATCH(request: Request) {
  const access = await getDashboardAccess();
  if (!access || access.role !== "ADMIN") return NextResponse.json({ error: "Staff permission required" }, { status: 403 });
  const body = await request.json() as { key?: unknown; value?: unknown };
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const value = typeof body.value === "string" ? body.value : "";
  if (!/^[a-z][a-z0-9_]{1,80}$/.test(key) || value.length > 2000) return NextResponse.json({ error: "Invalid setting" }, { status: 400 });
  const configuration = getDashboardConfiguration();
  if (configuration.dataSource !== "sqlite" || configuration.database !== "configured") return NextResponse.json({ error: "SQLite database unavailable" }, { status: 503 });
  const database = new Database(configuration.sqlitePath);
  try {
    database.prepare(`INSERT INTO automation_config (guild_id, key, value, updated_by, updated_at) VALUES (?, ?, ?, ?, unixepoch()) ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).run(process.env.DASHBOARD_GUILD_ID, key, value, access.userId);
    return NextResponse.json({ key, value, updatedBy: access.userId });
  } finally { database.close(); }
}